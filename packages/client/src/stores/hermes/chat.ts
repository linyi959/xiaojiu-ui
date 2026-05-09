import { startRunViaSocket, resumeSession, registerSessionHandlers, unregisterSessionHandlers, type RunEvent, type ContentBlock as ContentBlockImport } from '@/api/hermes/chat'
import { deleteSession as deleteSessionApi, fetchSession, fetchSessions, fetchHermesSessions, setSessionModel as setSessionModelApi, type HermesMessage, type SessionSummary } from '@/api/hermes/sessions'
import { getApiKey } from '@/api/client'
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAppStore } from './app'
import { useProfilesStore } from './profiles'
import { detectThinkingBoundary, parseThinking } from '@/utils/thinking-parser'

// Re-export ContentBlock for convenience
export type ContentBlock = ContentBlockImport

export interface Attachment {
  id: string
  name: string
  type: string
  size: number
  url: string
  file?: File
}

export interface Phase {
  id: string
  type: 'thinking' | 'tool_call' | 'final'
  // 内容：thinking=推理文本，tool_call=工具名，final=最终回复
  content: string
  // 工具调用相关字段
  toolName?: string
  toolArgs?: string
  toolPreview?: string
  toolResult?: string
  toolStatus?: 'running' | 'done' | 'error'
  toolDuration?: number
  // 流式状态
  isStreaming?: boolean
  // 折叠状态（用户可折叠）
  collapsed?: boolean
  // 时间戳
  timestamp?: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: number
  toolName?: string
  toolPreview?: string
  toolArgs?: string
  toolResult?: string
  toolStatus?: 'running' | 'done' | 'error'
  toolDuration?: number  // 工具执行时长（秒）
  isStreaming?: boolean
  attachments?: Attachment[]
  // 思考/推理文本。两条来源：
  //   1) 历史消息：来自 HermesMessage.reasoning 字段
  //   2) 流式：由 reasoning.delta / thinking.delta / reasoning.available 事件累加
  // 不含 <think> 包裹标签；内容自身可以为多段纯文本。
  reasoning?: string
  // Inline phases: 思维链路阶段（思考→工具调用→思考→工具调用→最终输出）
  // 流式过程中逐步累加，渲染时 inline 显示在消息内部
  phases?: Phase[]
}

export interface Session {
  id: string
  title: string
  source?: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  model?: string
  provider?: string
  messageCount?: number
  inputTokens?: number
  outputTokens?: number
  endedAt?: number | null
  lastActiveAt?: number
  workspace?: string | null
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

async function uploadFiles(attachments: Attachment[]): Promise<{ name: string; path: string }[]> {
  if (attachments.length === 0) return []
  const formData = new FormData()
  for (const att of attachments) {
    if (att.file) formData.append('file', att.file, att.name)
  }
  const token = localStorage.getItem('hermes_api_key') || ''
  const res = await fetch('/upload', {
    method: 'POST',
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  const data = await res.json() as { files: { name: string; path: string }[] }
  return data.files
}

async function buildContentBlocks(
  content: string,
  attachments?: Attachment[],
  uploadedFiles?: { name: string; path: string }[]
): Promise<ContentBlock[]> {
  const blocks: ContentBlock[] = []

  // Add text block if content is not empty
  if (content.trim()) {
    blocks.push({ type: 'text', text: content.trim() })
  }

  // Add attachment blocks using uploaded file paths
  if (attachments && attachments.length > 0 && uploadedFiles) {
    for (let i = 0; i < uploadedFiles.length; i++) {
      const uploaded = uploadedFiles[i]
      const attachment = attachments[i]

      // Check if it's an image
      if (attachment?.type.startsWith('image/')) {
        blocks.push({
          type: 'image',
          name: uploaded.name,
          path: uploaded.path,
          media_type: attachment.type,
        })
      } else {
        // Other files
        blocks.push({
          type: 'file',
          name: uploaded.name,
          path: uploaded.path,
          media_type: attachment?.type,
        })
      }
    }
  }

  return blocks
}

export function mapHermesMessages(msgs: HermesMessage[]): Message[] {
  // Build lookups from assistant messages with tool_calls
  const toolNameMap = new Map<string, string>()
  const toolArgsMap = new Map<string, string>()
  for (const msg of msgs) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.id) {
          if (tc.function?.name) toolNameMap.set(tc.id, tc.function.name)
          if (tc.function?.arguments) toolArgsMap.set(tc.id, tc.function.arguments)
        }
      }
    }
  }

  const result: Message[] = []
  const pendingToolMessages: Message[] = []

  const mergeToolIntoAssistantPhase = (toolMessage: Message): boolean => {
    const toolName = toolMessage.toolName || 'tool'
    const tcIdMatch = toolMessage.id.match(/(?:^|_)(call_[^_\s]+)/)
    const tcId = tcIdMatch?.[1] || ''
    let assistantWithPhase = [...result].reverse().find(
      m => m.role === 'assistant' && m.phases?.some(
        p => p.type === 'tool_call'
          && (
            (tcId && p.id.includes(tcId))
            || (!p.toolResult && p.toolName === toolName)
          )
      )
    )
    let matchingPhase = assistantWithPhase?.phases?.find(
      p => p.type === 'tool_call'
        && (
          (tcId && p.id.includes(tcId))
          || (!p.toolResult && p.toolName === toolName)
        )
    )

    // Visibility/resume can return tool result rows before, after, or without a
    // persisted assistant tool_call row. In that case, still attach the tool to
    // the nearest assistant message instead of rendering an orphan role='tool'
    // card. This keeps refresh and tab-return rendering semantically identical:
    // thinking card -> tool card chain.
    if (!matchingPhase) {
      assistantWithPhase = [...result].reverse().find(m => m.role === 'assistant')
      if (!assistantWithPhase) return false
      if (!assistantWithPhase.phases) assistantWithPhase.phases = []
      matchingPhase = {
        id: `${assistantWithPhase.id}_${tcId || toolName}_${toolMessage.id}`,
        type: 'tool_call',
        content: '',
        toolName,
        toolArgs: toolMessage.toolArgs,
        toolStatus: toolMessage.toolStatus || 'done',
        isStreaming: false,
        timestamp: toolMessage.timestamp,
      }
      assistantWithPhase.phases.push(matchingPhase)
    }

    matchingPhase.toolName = toolName
    matchingPhase.toolArgs = matchingPhase.toolArgs || toolMessage.toolArgs
    matchingPhase.toolPreview = toolMessage.toolPreview
    matchingPhase.toolResult = toolMessage.toolResult
    matchingPhase.toolStatus = toolMessage.toolStatus || 'done'
    matchingPhase.content = toolMessage.toolResult || ''
    return true
  }

  for (const msg of msgs) {
    // Tool result messages
    if (msg.role === 'tool') {
      const tcId = msg.tool_call_id || ''
      const toolName = msg.tool_name || toolNameMap.get(tcId) || 'tool'
      const toolArgs = toolArgsMap.get(tcId) || undefined
      // Extract a short preview from the content
      let preview = ''
      if (msg.content) {
        try {
          const parsed = JSON.parse(msg.content)
          preview = parsed.url || parsed.title || parsed.preview || parsed.summary || ''
        } catch {
          preview = msg.content.slice(0, 80)
        }
      }
      const toolMessage: Message = {
        id: `${String(msg.id)}_${tcId}`,
        role: 'tool',
        content: '',
        timestamp: Math.round(msg.timestamp * 1000),
        toolName,
        toolArgs,
        toolPreview: typeof preview === 'string' ? preview.slice(0, 100) || undefined : undefined,
        toolResult: msg.content || undefined,
        toolStatus: 'done',
      }
      if (!mergeToolIntoAssistantPhase(toolMessage)) {
        pendingToolMessages.push(toolMessage)
      }
      continue
    }

    // Rebuild phases for assistant messages (thinking + tool_call phases)
    // so cards render correctly after page refresh.
    const phases: Phase[] = []

    // Primary source: dedicated reasoning field
    const reasoningText = msg.reasoning?.trim() || null

    // Fallback: extract from <think> tags in content (some backends/stores don't persist reasoning separately)
    let extractedThinking: string | null = null
    if (!reasoningText && msg.content) {
      const parsed = parseThinking(msg.content, { streaming: false })
      if (parsed.hasThinking) {
        extractedThinking = parsed.segments.join('\n\n')
        if (parsed.pending) extractedThinking += '\n\n' + parsed.pending
      }
    }

    if (reasoningText || extractedThinking) {
      phases.push({
        id: String(msg.id) + '_thinking',
        type: 'thinking',
        content: reasoningText || extractedThinking!,
        isStreaming: false,
        timestamp: Math.round(msg.timestamp * 1000),
      })
    }
    if (msg.finish_reason === 'tool_calls' && msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        phases.push({
          id: String(msg.id) + '_' + (tc.id || 'tc'),
          type: 'tool_call',
          content: '',
          toolName: tc.function?.name || 'tool',
          toolArgs: tc.function?.arguments || undefined,
          toolStatus: (tc as any).status || 'done',
          toolDuration: (tc as any).duration || undefined,
          isStreaming: false,
          timestamp: Math.round(msg.timestamp * 1000),
        })
      }
    }

    // Add a final phase if this assistant message has content but no final phase was created.
    // This handles visibility-change resumption: mapHermesMessages only rebuilds thinking/tool_call
    // phases from stored data, but the final text lives in message.content.
    // Without this, hasPhaseTimeline=true (due to thinking/tool_call phases) but the final text
    // would not be rendered in the phase-timeline path.
    if (msg.role === 'assistant' && msg.content && !phases.some(p => p.type === 'final')) {
      phases.push({
        id: String(msg.id) + '_final',
        type: 'final',
        content: msg.content,
        isStreaming: false,
        timestamp: Math.round(msg.timestamp * 1000),
      })
    }

    // Normal user/assistant messages
    result.push({
      id: String(msg.id),
      role: msg.role,
      content: msg.content || '',
      timestamp: Math.round(msg.timestamp * 1000),
      reasoning: msg.reasoning ? msg.reasoning : undefined,
      phases: phases.length > 0 ? phases : undefined,
    })
  }
  for (const toolMessage of pendingToolMessages) {
    if (!mergeToolIntoAssistantPhase(toolMessage)) {
      result.push(toolMessage)
    }
  }

  return result
}

function mapHermesSession(s: SessionSummary): Session {
  return {
    id: s.id,
    title: s.title || '',
    source: s.source || undefined,
    messages: [],
    createdAt: Math.round(s.started_at * 1000),
    updatedAt: Math.round((s.last_active || s.ended_at || s.started_at) * 1000),
    model: s.model,
    provider: (s as any).billing_provider || '',
    messageCount: s.message_count,
    endedAt: s.ended_at != null ? Math.round(s.ended_at * 1000) : null,
    lastActiveAt: s.last_active != null ? Math.round(s.last_active * 1000) : undefined,
    workspace: s.workspace || null,
  }
}

const STORAGE_KEY_PREFIX = 'hermes_active_session_'
const LEGACY_STORAGE_KEY = 'hermes_active_session'
const IN_FLIGHT_TTL_MS = 15 * 60 * 1000 // Give up after 15 minutes

// 获取当前 profile 名称，用于隔离缓存。
// 从 profiles store 的 activeProfileName（同步 localStorage）读取，
// 避免异步加载导致 chat store 初始化时拿到 null。
function getProfileName(): string {
  try {
    return useProfilesStore().activeProfileName || 'default'
  } catch {
    return 'default'
  }
}

function storageKey(): string { return STORAGE_KEY_PREFIX + getProfileName() }
function legacyStorageKey(): string | null { return getProfileName() === 'default' ? LEGACY_STORAGE_KEY : null }
function inFlightKey(sid: string): string { return `hermes_in_flight_v1_${getProfileName()}_${sid}` }
function legacyInFlightKey(sid: string): string | null { return getProfileName() === 'default' ? `hermes_in_flight_v1_${sid}` : null }

interface InFlightRun {
  runId: string
  startedAt: number
}

function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { name?: string, code?: number }
  return e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014
}

function recoverStorageQuota() {
  try {
    // 清理所有会话相关的旧缓存（已完全废弃）
    const prefixes = [
      'hermes_sessions_cache_v1_',
      'hermes_session_msgs_v1_',
      'hermes_session_pins_v1_',
      'hermes_human_only_v1_',
    ]
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      if (key === storageKey() || key === LEGACY_STORAGE_KEY) continue
      if (prefixes.some(prefix => key.startsWith(prefix))) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => removeItem(key))
    if (keysToRemove.length > 0) {
      console.log(`Recovered storage: cleared ${keysToRemove.length} old session cache entries`)
    }
  } catch {
    // ignore
  }
}

function setItemBestEffort(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
    return
  } catch (error) {
    if (!isQuotaExceededError(error)) return
  }

  recoverStorageQuota()

  try {
    localStorage.setItem(key, value)
  } catch {
    // quota exceeded or private mode — ignore, cache is best-effort
  }
}

function saveJson(key: string, value: unknown) {
  try {
    setItemBestEffort(key, JSON.stringify(value))
  } catch {
    // quota exceeded or private mode — ignore, cache is best-effort
  }
}

function removeItem(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

function loadJsonWithFallback<T>(key: string, legacyKey?: string | null): T | null {
  const value = loadJson<T>(key)
  if (value != null) return value
  if (!legacyKey) return null
  return loadJson<T>(legacyKey)
}

function saveJsonWithLegacy(key: string, value: unknown, legacyKey?: string | null) {
  saveJson(key, value)
  if (legacyKey) removeItem(legacyKey)
}

function removeItemWithLegacy(key: string, legacyKey?: string | null) {
  removeItem(key)
  if (legacyKey) removeItem(legacyKey)
}

// Strip the circular `file: File` reference from attachments before caching —
// File objects don't serialize and we only need name/type/size/url for display.

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<Session[]>([])
  const activeSessionId = ref<string | null>(null)
  const focusMessageId = ref<string | null>(null)
  const streamStates = ref<Map<string, { abort: () => void }>>(new Map())
  /** sessionId → server-reported isWorking status */
  const serverWorking = ref<Set<string>>(new Set())

  // 自动播放语音开关
  const autoPlaySpeechEnabled = ref(false)

  function setAutoPlaySpeech(enabled: boolean) {
    autoPlaySpeechEnabled.value = enabled
  }
  const isStreaming = computed(() => {
    const sid = activeSessionId.value
    if (sid == null) return false
    return streamStates.value.has(sid) || serverWorking.value.has(sid)
  })
  const isLoadingSessions = ref(false)
  const sessionsLoaded = ref(false)
  const isLoadingMessages = ref(false)
  const isRunActive = computed(() => isStreaming.value)

  // Compression state
  const compressionState = ref<{
    compressing: boolean
    messageCount: number
    beforeTokens: number
    afterTokens: number
    compressed: boolean | null
    error?: string
  } | null>(null)

  function setCompressionState(state: typeof compressionState.value) {
    compressionState.value = state
  }

  const activeSession = ref<Session | null>(null)
  const messages = computed<Message[]>(() => activeSession.value?.messages || [])

  function isSessionLive(sessionId: string): boolean {
    return streamStates.value.has(sessionId) || serverWorking.value.has(sessionId)
  }

  function markInFlight(sid: string, runId: string) {
    saveJsonWithLegacy(inFlightKey(sid), { runId, startedAt: Date.now() } as InFlightRun, legacyInFlightKey(sid))
  }

  function clearInFlight(sid: string) {
    removeItemWithLegacy(inFlightKey(sid), legacyInFlightKey(sid))
  }

  function readInFlight(sid: string): InFlightRun | null {
    const rec = loadJsonWithFallback<InFlightRun>(inFlightKey(sid), legacyInFlightKey(sid))
    if (!rec) return null
    if (Date.now() - rec.startedAt > IN_FLIGHT_TTL_MS) {
      removeItemWithLegacy(inFlightKey(sid), legacyInFlightKey(sid))
      return null
    }
    return rec
  }

  async function loadSessions() {
    isLoadingSessions.value = true
    try {
      const [apiSessions, hermesHistorySessions] = await Promise.all([
        fetchSessions(),
        fetchHermesSessions(),
      ])
      const mergedById = new Map<string, SessionSummary>()
      for (const item of [...apiSessions, ...hermesHistorySessions]) {
        mergedById.set(item.id, item)
      }
      const list = [...mergedById.values()].sort((a, b) =>
        (b.last_active || b.ended_at || b.started_at || 0) -
        (a.last_active || a.ended_at || a.started_at || 0)
      )
      const fresh = list.map(mapHermesSession)
      const freshIds = new Set(fresh.map(s => s.id))
      // Preserve already-loaded messages for sessions that are still present,
      // so we don't blow away the active session's messages on refresh.
      const msgsByIdBefore = new Map(sessions.value.map(s => [s.id, s.messages]))
      for (const s of fresh) {
        const prev = msgsByIdBefore.get(s.id)
        if (prev && prev.length) s.messages = prev
      }
      // Preserve local-only sessions the server hasn't seen yet — e.g. a chat
      // that was just created and whose first run is still in-flight. Without
      // this, refreshing mid-run would wipe the session and fall back to
      // sessions[0], which is exactly what the user reported.
      // Sessions without an active in-flight run are considered deleted and
      // cleaned up along with their cached messages.
      const localOnly = sessions.value.filter(s => {
        if (freshIds.has(s.id)) return false
        if (readInFlight(s.id)) return true
        removeItemWithLegacy(inFlightKey(s.id), legacyInFlightKey(s.id))
        return false
      })
      sessions.value = [...localOnly, ...fresh]

      // Restore last active session, fallback to most recent
      const savedId = activeSessionId.value
      const targetId = savedId && sessions.value.some(s => s.id === savedId)
        ? savedId
        : sessions.value[0]?.id
      if (targetId) {
        await switchSession(targetId)
      }
    } catch (err) {
      console.error('Failed to load sessions:', err)
    } finally {
      isLoadingSessions.value = false
      sessionsLoaded.value = true
    }
  }

  // Re-pull active session from server. Used on tab-visible events.
  async function refreshActiveSession(): Promise<boolean> {
    const sid = activeSessionId.value
    if (!sid) return false
    try {
      const detail = await fetchSession(sid)
      if (!detail) return false
      const target = sessions.value.find(s => s.id === sid)
      if (!target) return false
      const mapped = mapHermesMessages(detail.messages || [])
      target.messages = mapped
      if (detail.title) target.title = detail.title
      return true
    } catch (err) {
      console.error('Failed to refresh active session:', err)
      return false
    }
  }


  function createSession(): Session {
    const session: Session = {
      id: uid(),
      title: '',
      source: 'api_server',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    sessions.value.unshift(session)
    return session
  }

  async function switchSession(sessionId: string, focusId?: string | null) {
    clearThinkingObservationFor(sessionId)
    activeSessionId.value = sessionId
    focusMessageId.value = focusId ?? null
    setItemBestEffort(storageKey(), sessionId)
    const legacyActiveKey = legacyStorageKey()
    if (legacyActiveKey) removeItem(legacyActiveKey)
    activeSession.value = sessions.value.find(s => s.id === sessionId) || null

    if (!activeSession.value) return

    isLoadingMessages.value = true

    try {
      // Load messages via Socket.IO resume (server loads from DB if not in memory)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('resume timeout')), 15_000)
        resumeSession(sessionId, (data) => {
          clearTimeout(timeout)
          if (data.isWorking) {
            serverWorking.value.add(sessionId)
          } else {
            serverWorking.value.delete(sessionId)
          }
          if (data.inputTokens != null) activeSession.value!.inputTokens = data.inputTokens
          if (data.outputTokens != null) activeSession.value!.outputTokens = data.outputTokens
          if (data.messages?.length) {
            activeSession.value!.messages = mapHermesMessages(data.messages as any[])
          }
          if (!activeSession.value!.title) {
            const firstUser = activeSession.value!.messages.find(m => m.role === 'user')
            if (firstUser) {
              const t = firstUser.content.slice(0, 40)
              activeSession.value!.title = t + (firstUser.content.length > 40 ? '...' : '')
            }
          }
          // Process replayed events (compression state etc.)
          if (data.events?.length) {
            for (const evt of data.events) {
              const e = evt.data as any
              if (e.event === 'compression.started') {
                setCompressionState({
                  compressing: true,
                  messageCount: e.message_count || 0,
                  beforeTokens: e.token_count || 0,
                  afterTokens: 0,
                  compressed: null,
                })
              } else if (e.event === 'compression.completed') {
                setCompressionState({
                  compressing: false,
                  messageCount: e.totalMessages || 0,
                  beforeTokens: e.beforeTokens || 0,
                  afterTokens: e.afterTokens || 0,
                  compressed: e.compressed ?? false,
                  error: e.error,
                })
              }
            }
          }
          resolve()
        })
      })
    } catch (err) {
      console.error('Failed to load session messages via resume:', err)
    } finally {
      // Only load from REST API if there are no messages yet.
      // When navigating back to this session, the store already
      // has the rich phase structure (thinking/tool_call/final with
      // durations, streaming states) from the streaming path.
      if (!activeSession.value?.messages.length) {
        await refreshActiveSession()
      }
      isLoadingMessages.value = false
    }

    // Resume in-flight run event listeners if needed
    resumeInFlightRun(sessionId)
  }

  function newChat() {
    const session = createSession()
    // Inherit current global model
    const appStore = useAppStore()
    session.model = appStore.selectedModel || undefined
    switchSession(session.id)
  }

  async function switchSessionModel(modelId: string, provider?: string) {
    if (!activeSession.value) return
    activeSession.value.model = modelId
    activeSession.value.provider = provider || ''
    // If provider changed, update global config too (Hermes requires it)
    if (provider) {
      const { useAppStore } = await import('./app')
      await useAppStore().switchModel(modelId, provider)
    }

    // Persist model override to server (BFF session-store)
    if (activeSession.value.source !== 'hermes') {
      try {
        await setSessionModelApi(activeSession.value.id, modelId, provider)
      } catch (err) {
        console.error('Failed to persist session model:', err)
      }
    }
  }

  async function deleteSession(sessionId: string) {
    await deleteSessionApi(sessionId)
    sessions.value = sessions.value.filter(s => s.id !== sessionId)
    if (activeSessionId.value === sessionId) {
      if (sessions.value.length > 0) {
        await switchSession(sessions.value[0].id)
      } else {
        const session = createSession()
        switchSession(session.id)
      }
    }
  }

  function getSessionMsgs(sessionId: string): Message[] {
    const s = sessions.value.find(s => s.id === sessionId)
    return s?.messages || []
  }

  function addMessage(sessionId: string, msg: Message) {
    const s = sessions.value.find(s => s.id === sessionId)
    if (s) s.messages.push(msg)
  }

  function addOrUpdateSession(session: Session) {
    const existingIndex = sessions.value.findIndex(s => s.id === session.id)
    if (existingIndex !== -1) {
      // Update existing session
      sessions.value[existingIndex] = session
    } else {
      // Add new session
      sessions.value.push(session)
    }
  }

  function updateMessage(sessionId: string, id: string, update: Partial<Message>) {
    const s = sessions.value.find(s => s.id === sessionId)
    if (!s) return
    const idx = s.messages.findIndex(m => m.id === id)
    if (idx !== -1) {
      s.messages[idx] = { ...s.messages[idx], ...update }
    }
  }

  function updateSessionTitle(sessionId: string) {
    const target = sessions.value.find(s => s.id === sessionId)
    if (!target) return
    if (!target.title) {
      const firstUser = target.messages.find(m => m.role === 'user')
      if (firstUser) {
        const title = firstUser.attachments?.length
          ? firstUser.attachments.map(a => a.name).join(', ')
          : firstUser.content
        target.title = title.slice(0, 40) + (title.length > 40 ? '...' : '')
      }
    }
    target.updatedAt = Date.now()
  }

  async function sendMessage(content: string, attachments?: Attachment[]) {
    if ((!content.trim() && !(attachments && attachments.length > 0)) || isStreaming.value) return

    if (!activeSession.value) {
      const session = createSession()
      switchSession(session.id)
    }

    // Capture session ID at send time — all callbacks use this, not activeSessionId
    const sid = activeSessionId.value!

    const userMsg: Message = {
      id: uid(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
    }

    addMessage(sid, userMsg)


    updateSessionTitle(sid)

    try {

      // Build input in Anthropic format
      let input: string | ContentBlock[]
      if (attachments && attachments.length > 0) {
        // Has attachments: upload first, then build content blocks
        const uploaded = await uploadFiles(attachments)

        // Update attachment URLs on the user message for display
        const token = getApiKey()
        const urlMap = new Map(uploaded.map(f => {
          const base = `/api/hermes/download?path=${encodeURIComponent(f.path)}&name=${encodeURIComponent(f.name)}`
          return [f.name, token ? `${base}&token=${encodeURIComponent(token)}` : base]
        }))
        const msgs = getSessionMsgs(sid)
        const lastUser = msgs.findLast(m => m.id === userMsg.id)
        if (lastUser?.attachments) {
          lastUser.attachments = lastUser.attachments.map(a => {
            const dl = urlMap.get(a.name)
            return dl ? { ...a, url: dl } : a
          })
        }

        // Build content blocks with uploaded file paths
        input = await buildContentBlocks(content, attachments, uploaded)
      } else {
        // No attachments: use plain text format
        input = content.trim()
      }

      const appStore = useAppStore()
      const sessionModel = activeSession.value?.model || appStore.selectedModel
      const runPayload = {
        input,
        session_id: sid,
        model: sessionModel || undefined,
      }

      // Helper to clean up this session's stream state
      const cleanup = () => {
        console.log('[sendMessage] cleanup called, deleting stream state for sid:', sid)
        streamStates.value.delete(sid)
        serverWorking.value.delete(sid)
        console.log('[sendMessage] cleanup done, isStreaming now:', isStreaming.value)
      }

      // Per-run flags used to detect silently-swallowed errors at run.completed.
      // hermes-agent occasionally emits run.completed with empty output and no
      // usage when the agent layer caught an upstream error (e.g. invalid API
      // key). We need to distinguish: (a) run with assistant text produced,
      // (b) run with only tool activity, (c) run with truly nothing visible.
      // Reset per send() call — closures captured by Socket.IO callbacks are scoped
      // to this run, so there is no cross-run contamination.
      let runProducedAssistantText = false
      let runHadToolActivity = false

      // Send run via Socket.IO and listen to streamed events — all closures capture `sid`
      const ctrl = startRunViaSocket(
        runPayload,
        // onEvent
        (evt: RunEvent) => {
          switch (evt.event) {
            case 'run.started':
              break

            case 'compression.started': {
              setCompressionState({
                compressing: true,
                messageCount: (evt as any).message_count || 0,
                beforeTokens: (evt as any).token_count || 0,
                afterTokens: 0,
                compressed: null,
              })
              break
            }

            case 'compression.completed': {
              setCompressionState({
                compressing: false,
                messageCount: (evt as any).totalMessages || 0,
                beforeTokens: (evt as any).beforeTokens || 0,
                afterTokens: (evt as any).afterTokens || 0,
                compressed: (evt as any).compressed ?? false,
                error: (evt as any).error,
              })
              // Auto-clear after 5s
              setTimeout(() => {
                if (compressionState.value && !compressionState.value.compressing) {
                  setCompressionState(null)
                }
              }, 5000)
              break
            }

            case 'reasoning.delta':
            case 'thinking.delta': {
              const text = evt.text || evt.delta || ''
              if (!text) break
              runProducedAssistantText = true
              const msgs = getSessionMsgs(sid)
              let assistantMsg = msgs[msgs.length - 1]

              if (assistantMsg?.role === 'assistant' && assistantMsg.isStreaming) {
                // 追加到 reasoning 字段（保留旧字段兼容）
                assistantMsg.reasoning = (assistantMsg.reasoning || '') + text
                noteReasoningStart(assistantMsg.id)
                // 同时更新或创建 thinking phase
                if (!assistantMsg.phases) assistantMsg.phases = []
                const phases = assistantMsg.phases
                const lastPhase = phases[phases.length - 1]
                if (lastPhase && lastPhase.type === 'thinking' && lastPhase.isStreaming) {
                  lastPhase.content += text
                } else {
                  // 创建新的 thinking phase
                  phases.push({
                    id: uid(),
                    type: 'thinking',
                    content: text,
                    isStreaming: true,
                    timestamp: Date.now(),
                  })
                }
              } else {
                const newId = uid()
                const thinkingPhase: Phase = {
                  id: uid(),
                  type: 'thinking',
                  content: text,
                  isStreaming: true,
                  timestamp: Date.now(),
                }
                addMessage(sid, {
                  id: newId,
                  role: 'assistant',
                  content: '',
                  timestamp: Date.now(),
                  isStreaming: true,
                  reasoning: text,
                  phases: [thinkingPhase],
                })
                noteReasoningStart(newId)
              }

              break
            }

            case 'reasoning.available': {
              // Upstream run_agent.py fires reasoning.available with
              // `assistant_message.content[:500]` as the preview — i.e.,
              // the main answer, not real reasoning. Ignore the payload
              // and only use this event as a "thinking ended" signal so
              // the duration counter stops.
              const msgs = getSessionMsgs(sid)
              const last = msgs[msgs.length - 1]
              if (last?.role === 'assistant' && last.isStreaming) {
                // 只有当 reasoning.delta 事件曾经启动过计时，才标记结束；
                // 否则（上游未转发 delta，只发这一次 available）不显示时长。
                noteReasoningEnd(last.id)
                // 标记最后一个 thinking phase 为已结束
                if (last.phases && last.phases.length > 0) {
                  const lastPhase = last.phases[last.phases.length - 1]
                  if (lastPhase.type === 'thinking' && lastPhase.isStreaming) {
                    lastPhase.isStreaming = false
                  }
                }
              }

              break
            }

            case 'message.delta': {
              if (evt.delta) runProducedAssistantText = true
              const msgs = getSessionMsgs(sid)
              const last = msgs[msgs.length - 1]
              if (last?.role === 'assistant' && last.isStreaming) {
                const prev = last.content
                const next = prev + (evt.delta || '')
                noteThinkingDelta(last.id, prev, next)
                // 若之前有 reasoning 累积，则 content 到达即视为推理结束。
                if (last.reasoning) noteReasoningEnd(last.id)
                last.content = next
                // 更新或创建 final phase
                if (!last.phases) last.phases = []
                const phases = last.phases
                const lastPhase = phases[phases.length - 1]
                if (lastPhase && lastPhase.type === 'final' && lastPhase.isStreaming) {
                  lastPhase.content += (evt.delta || '')
                } else {
                  phases.push({
                    id: uid(),
                    type: 'final',
                    content: evt.delta || '',
                    isStreaming: true,
                    timestamp: Date.now(),
                  })
                }
              } else {
                const newId = uid()
                const nextContent = evt.delta || ''
                noteThinkingDelta(newId, '', nextContent)
                const finalPhase: Phase = {
                  id: uid(),
                  type: 'final',
                  content: nextContent,
                  isStreaming: true,
                  timestamp: Date.now(),
                }
                addMessage(sid, {
                  id: newId,
                  role: 'assistant',
                  content: nextContent,
                  timestamp: Date.now(),
                  isStreaming: true,
                  phases: [finalPhase],
                })
              }

              break
            }

            case 'tool.started': {
              runHadToolActivity = true
              const msgs = getSessionMsgs(sid)
              let assistantMsg = [...msgs].reverse().find(m => m.role === 'assistant' && m.isStreaming)
              if (!assistantMsg) {
                const newId = uid()
                assistantMsg = {
                  id: newId,
                  role: 'assistant',
                  content: '',
                  timestamp: Date.now(),
                  isStreaming: true,
                  phases: [],
                }
                addMessage(sid, assistantMsg)
              }
              if (!assistantMsg.phases) assistantMsg.phases = []
              assistantMsg.phases.push({
                id: (evt as any).tool_call_id || uid(),
                type: 'tool_call',
                content: '',
                toolName: (evt as any).tool || (evt as any).name || 'tool',
                toolArgs: (evt as any).args || (evt as any).arguments,
                toolPreview: (evt as any).preview || undefined,
                toolStatus: 'running',
                isStreaming: true,
                timestamp: Date.now(),
              })
              break
            }

            case 'tool.completed': {
              runHadToolActivity = true
              const msgs = getSessionMsgs(sid)
              const assistantMsg = [...msgs].reverse().find(m => m.role === 'assistant' && m.phases?.length)
              const phases = assistantMsg?.phases || []
              const phase = [...phases].reverse().find(p => p.type === 'tool_call' && p.toolStatus === 'running')
              if (phase) {
                const output = (evt as any).output
                const result = output == null ? undefined : (typeof output === 'string' ? output : JSON.stringify(output))
                const hasError = (evt as any).error === true
                phase.toolStatus = hasError ? 'error' : 'done'
                phase.isStreaming = false
                phase.toolResult = result
                phase.content = result || ''
                phase.toolPreview = (evt as any).preview || phase.toolPreview
                phase.toolDuration = (evt as any).duration || phase.toolDuration
              }
              break
            }

            case 'run.completed': {
              const msgs = getSessionMsgs(sid)
              const lastMsg = msgs[msgs.length - 1]
              if (lastMsg?.isStreaming) {
                updateMessage(sid, lastMsg.id, { isStreaming: false })
                // 关闭所有 streaming 的 phase
                if (lastMsg.phases) {
                  for (const phase of lastMsg.phases) {
                    if (phase.isStreaming) phase.isStreaming = false
                  }
                }
              }
              // Server-computed usage (local countTokens, snapshot-aware)
              if ((evt as any).inputTokens != null) {
                const target = sessions.value.find(s => s.id === sid)
                if (target) {
                  target.inputTokens = (evt as any).inputTokens
                  target.outputTokens = (evt as any).outputTokens
                }
              }
              // Belt-and-suspenders: some providers may deliver the final
              // assistant text only via run.completed.output (no message.delta
              // stream). If we never produced assistant text but the gateway
              // reports a non-empty output, fall back to rendering it as a
              // single assistant message so the user actually sees the reply.

              // Check if backend provided parsed content (from stringified array format)
              let finalOutputTrimmed = ''
              if ((evt as any).parsed_content !== undefined) {
                // Backend has parsed stringified array format, update last assistant message
                const msgs = getSessionMsgs(sid)
                const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant')
                if (lastAssistant) {
                  updateMessage(sid, lastAssistant.id, {
                    content: (evt as any).parsed_content || '',
                  })
                  if ((evt as any).parsed_reasoning) {
                    updateMessage(sid, lastAssistant.id, {
                      reasoning: (evt as any).parsed_reasoning,
                    })
                  }
                  finalOutputTrimmed = ((evt as any).parsed_content || '').trim()
                }
              } else {
                // Fallback to output field (legacy behavior)
                const finalOutput =
                  typeof evt.output === 'string' ? evt.output : ''
                finalOutputTrimmed = finalOutput.trim()
                if (!runProducedAssistantText && finalOutputTrimmed !== '') {
                  addMessage(sid, {
                    id: uid(),
                    role: 'assistant',
                    content: finalOutput,
                    timestamp: Date.now(),
                  })
                  runProducedAssistantText = true
                }
              }
              // Workaround for upstream hermes-agent bug: when the agent
              // layer silently swallows an error (e.g. invalid API key,
              // unsupported model), the gateway still emits run.completed
              // with an empty output. Without surfacing it here the chat UI
              // looks frozen / "succeeded with no reply". Detect by the
              // combination of: no assistant text AND no tool activity AND
              // empty final output. Usage being zero is a *supporting*
              // signal but not required, since some providers/local models
              // legitimately omit usage.
              const swallowedError =
                !runProducedAssistantText &&
                !runHadToolActivity &&
                finalOutputTrimmed === ''
              if (swallowedError) {
                addMessage(sid, {
                  id: uid(),
                  role: 'system',
                  content: 'Error: Agent returned no output. The model call may have failed (e.g. invalid API key, model not supported by provider, or context exceeded). Check the hermes-agent logs for details.',
                  timestamp: Date.now(),
                })
              }

              // 自动播放语音
              console.log('[run.completed] autoPlaySpeechEnabled:', autoPlaySpeechEnabled.value)
              if (autoPlaySpeechEnabled.value) {
                const msgs = getSessionMsgs(sid)
                const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant')
                if (lastAssistant?.content) {
                  // 延迟一小会儿再播放，确保 UI 更新完成
                  setTimeout(() => {
                    playMessageSpeech(lastAssistant.id, lastAssistant.content)
                  }, 300)
                }
              }

              cleanup()
              updateSessionTitle(sid)
              // the in-flight marker. If the browser is reloading right now
              // and kills us between the two localStorage writes, we want
              // the next page load to still see in-flight === true (so
              // polling kicks in and recovers) rather than the other way
              // around (cleared in-flight + stale streaming cache = UI stuck).

              clearInFlight(sid)
              break
            }

            case 'run.failed': {
              const msgs = getSessionMsgs(sid)
              const lastErr = msgs[msgs.length - 1]
              if (lastErr?.isStreaming) {
                updateMessage(sid, lastErr.id, {
                  isStreaming: false,
                  content: evt.error ? `Error: ${evt.error}` : 'Run failed',
                  role: 'system',
                })
                // 关闭所有 streaming 的 phase
                if (lastErr.phases) {
                  for (const phase of lastErr.phases) {
                    if (phase.isStreaming) phase.isStreaming = false
                  }
                }
              } else {
                addMessage(sid, {
                  id: uid(),
                  role: 'system',
                  content: evt.error ? `Error: ${evt.error}` : 'Run failed',
                  timestamp: Date.now(),
                })
              }
              // 标记所有 running 的 tool phases 为 error
              for (const m of msgs) {
                if (m.role === 'assistant' && m.phases) {
                  for (const p of m.phases) {
                    if (p.type === 'tool_call' && p.toolStatus === 'running') {
                      p.toolStatus = 'error'
                      p.isStreaming = false
                    }
                  }
                }
              }
              cleanup()

              clearInFlight(sid)
              break
            }

            case 'usage.updated': {
              const target = sessions.value.find(s => s.id === sid)
              if (target) {
                target.inputTokens = (evt as any).inputTokens
                target.outputTokens = (evt as any).outputTokens
              }
              break
            }
          }
        },
        // onDone
        () => {
          console.log('[sendMessage] onDone callback called, cleaning up stream state')
          const msgs = getSessionMsgs(sid)
          const last = msgs[msgs.length - 1]
          if (last?.isStreaming) {
            updateMessage(sid, last.id, { isStreaming: false })
          }
          cleanup()
          updateSessionTitle(sid)
        },
        // onError
        (err) => {
          console.warn('Socket.IO run stream error:', err.message)
          const msgs = getSessionMsgs(sid)
          const last = msgs[msgs.length - 1]
          if (last?.isStreaming) {
            updateMessage(sid, last.id, { isStreaming: false })
          }
          msgs.forEach((m, i) => {
            if (m.role === 'tool' && m.toolStatus === 'running') {
              msgs[i] = { ...m, toolStatus: 'done' }
            }
          })
          cleanup()
          if (sid === activeSessionId.value) {
            void refreshActiveSession()
          }
        },
        // onStarted — called when server acks with run_id
        (runId: string) => {
          markInFlight(sid, runId)
        },
      )

      streamStates.value.set(sid, ctrl)
    } catch (err: any) {
      addMessage(sid, {
        id: uid(),
        role: 'system',
        content: `Error: ${err.message}`,
        timestamp: Date.now(),
      })
      throw err
    }
  }

  /**
   * Resume an in-flight run after page refresh.
   * Emits 'resume' to join the session room on the server,
   * then sets up event listeners to receive ongoing events.
   */
  function resumeInFlightRun(sid: string) {
    // Don't register duplicate listeners if already streaming
    if (streamStates.value.has(sid)) return
    // Only set up listeners if there's an actual in-flight run
    if (!readInFlight(sid)) return

    let closed = false
    let runProducedAssistantText = false
    let runHadToolActivity = false

    const cleanup = () => {
      if (closed) return
      closed = true
      streamStates.value.delete(sid)
      serverWorking.value.delete(sid)
      // Unregister from global session handlers
      unregisterSessionHandlers(sid)
    }

    // Shared event handler — filters by session_id tag
    function handleEvent(evt: RunEvent) {
      if (closed) return
      // Filter events for this session (server tags all events with session_id)
      if (evt.session_id && evt.session_id !== sid) return
      switch (evt.event) {
        case 'run.started':
          break

        case 'compression.started': {
          setCompressionState({
            compressing: true,
            messageCount: (evt as any).message_count || 0,
            beforeTokens: (evt as any).token_count || 0,
            afterTokens: 0,
            compressed: null,
          })
          break
        }

        case 'compression.completed': {
          setCompressionState({
            compressing: false,
            messageCount: (evt as any).totalMessages || 0,
            beforeTokens: (evt as any).beforeTokens || 0,
            afterTokens: (evt as any).afterTokens || 0,
            compressed: (evt as any).compressed ?? false,
            error: (evt as any).error,
          })
          setTimeout(() => {
            if (compressionState.value && !compressionState.value.compressing) {
              setCompressionState(null)
            }
          }, 5000)
          break
        }

        case 'reasoning.delta':
        case 'thinking.delta': {
          const text = evt.text || evt.delta || ''
          if (!text) break
          runProducedAssistantText = true
          const msgs = getSessionMsgs(sid)
          let assistantMsg = msgs[msgs.length - 1]
          if (assistantMsg?.role === 'assistant' && assistantMsg.isStreaming) {
            assistantMsg.reasoning = (assistantMsg.reasoning || '') + text
            noteReasoningStart(assistantMsg.id)
            if (!assistantMsg.phases) assistantMsg.phases = []
            const phases = assistantMsg.phases
            const lastPhase = phases[phases.length - 1]
            if (lastPhase && lastPhase.type === 'thinking' && lastPhase.isStreaming) {
              lastPhase.content += text
            } else {
              phases.push({
                id: uid(),
                type: 'thinking',
                content: text,
                isStreaming: true,
                timestamp: Date.now(),
              })
            }
          } else {
            const newId = uid()
            const thinkingPhase: Phase = {
              id: uid(),
              type: 'thinking',
              content: text,
              isStreaming: true,
              timestamp: Date.now(),
            }
            addMessage(sid, {
              id: newId,
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              isStreaming: true,
              reasoning: text,
              phases: [thinkingPhase],
            })
            noteReasoningStart(newId)
          }

          break
        }

        case 'reasoning.available': {
          const msgs = getSessionMsgs(sid)
          const last = msgs[msgs.length - 1]
          if (last?.role === 'assistant' && last.isStreaming) {
            noteReasoningEnd(last.id)
          }

          break
        }

        case 'message.delta': {
          if (evt.delta) runProducedAssistantText = true
          const msgs = getSessionMsgs(sid)
          const last = msgs[msgs.length - 1]
          if (last?.role === 'assistant' && last.isStreaming) {
            const prev = last.content
            const next = prev + (evt.delta || '')
            noteThinkingDelta(last.id, prev, next)
            if (last.reasoning) noteReasoningEnd(last.id)
            last.content = next
            if (!last.phases) last.phases = []
            const phases = last.phases
            const lastPhase = phases[phases.length - 1]
            if (lastPhase && lastPhase.type === 'final' && lastPhase.isStreaming) {
              lastPhase.content += (evt.delta || '')
            } else {
              phases.push({
                id: uid(),
                type: 'final',
                content: evt.delta || '',
                isStreaming: true,
                timestamp: Date.now(),
              })
            }
          } else {
            const newId = uid()
            const nextContent = evt.delta || ''
            noteThinkingDelta(newId, '', nextContent)
            const finalPhase: Phase = {
              id: uid(),
              type: 'final',
              content: nextContent,
              isStreaming: true,
              timestamp: Date.now(),
            }
            addMessage(sid, {
              id: newId,
              role: 'assistant',
              content: nextContent,
              timestamp: Date.now(),
              isStreaming: true,
              phases: [finalPhase],
            })
          }

          break
        }

        case 'tool.started': {
          runHadToolActivity = true
          const msgs = getSessionMsgs(sid)
          let assistantMsg = [...msgs].reverse().find(m => m.role === 'assistant' && m.isStreaming)
          if (!assistantMsg) {
            const newId = uid()
            assistantMsg = {
              id: newId,
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              isStreaming: true,
              phases: [],
            }
            addMessage(sid, assistantMsg)
          }
          if (!assistantMsg.phases) assistantMsg.phases = []
          assistantMsg.phases.push({
            id: (evt as any).tool_call_id || uid(),
            type: 'tool_call',
            content: '',
            toolName: (evt as any).tool || (evt as any).name || 'tool',
            toolArgs: (evt as any).args || (evt as any).arguments,
            toolPreview: (evt as any).preview || undefined,
            toolStatus: 'running',
            isStreaming: true,
            timestamp: Date.now(),
          })

          break
        }

        case 'tool.completed': {
          runHadToolActivity = true
          const msgs = getSessionMsgs(sid)
          const assistantMsg = [...msgs].reverse().find(m => m.role === 'assistant' && m.phases?.length)
          const phases = assistantMsg?.phases || []
          const phase = [...phases].reverse().find(p => p.type === 'tool_call' && p.toolStatus === 'running')
          if (phase) {
            const output = (evt as any).output
            const result = output == null ? undefined : (typeof output === 'string' ? output : JSON.stringify(output))
            const hasError = (evt as any).error === true
            phase.toolStatus = hasError ? 'error' : 'done'
            phase.isStreaming = false
            phase.toolResult = result
            phase.content = result || ''
            phase.toolPreview = (evt as any).preview || phase.toolPreview
            phase.toolDuration = (evt as any).duration || phase.toolDuration
          }

          break
        }

        case 'run.completed': {
          const msgs = getSessionMsgs(sid)
          const lastMsg = msgs[msgs.length - 1]
          if (lastMsg?.isStreaming) {
            updateMessage(sid, lastMsg.id, { isStreaming: false })
            if (lastMsg.phases) {
              for (const phase of lastMsg.phases) {
                if (phase.isStreaming) phase.isStreaming = false
              }
            }
          }
          // Server-computed usage (local countTokens, snapshot-aware)
          if ((evt as any).inputTokens != null) {
            const target = sessions.value.find(s => s.id === sid)
            if (target) {
              target.inputTokens = (evt as any).inputTokens
              target.outputTokens = (evt as any).outputTokens
            }
          }
          // Check if backend provided parsed content (from stringified array format)
          let finalOutputTrimmed = ''
          if ((evt as any).parsed_content !== undefined) {
            // Backend has parsed stringified array format, update last assistant message
            const msgs = getSessionMsgs(sid)
            const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant')
            if (lastAssistant) {
              updateMessage(sid, lastAssistant.id, {
                content: (evt as any).parsed_content || '',
              })
              if ((evt as any).parsed_reasoning) {
                updateMessage(sid, lastAssistant.id, {
                  reasoning: (evt as any).parsed_reasoning,
                })
              }
              finalOutputTrimmed = ((evt as any).parsed_content || '').trim()
            }
          } else {
            // Fallback to output field (legacy behavior)
            const finalOutput = typeof evt.output === 'string' ? evt.output : ''
            finalOutputTrimmed = finalOutput.trim()
            if (!runProducedAssistantText && finalOutputTrimmed !== '') {
              addMessage(sid, {
                id: uid(),
                role: 'assistant',
                content: finalOutput,
                timestamp: Date.now(),
              })
            }
          }
          const swallowedError = !runProducedAssistantText && !runHadToolActivity && finalOutputTrimmed === ''
          if (swallowedError) {
            addMessage(sid, {
              id: uid(),
              role: 'system',
              content: 'Error: Agent returned no output. The model call may have failed (e.g. invalid API key, model not supported by provider, or context exceeded). Check the hermes-agent logs for details.',
              timestamp: Date.now(),
            })
          }


          cleanup()
          updateSessionTitle(sid)

          clearInFlight(sid)
          break
        }

        case 'run.failed': {
          const msgs = getSessionMsgs(sid)
          const lastErr = msgs[msgs.length - 1]
          if (lastErr?.isStreaming) {
            updateMessage(sid, lastErr.id, {
              isStreaming: false,
              content: evt.error ? `Error: ${evt.error}` : 'Run failed',
              role: 'system',
            })
          } else {
            addMessage(sid, {
              id: uid(),
              role: 'system',
              content: evt.error ? `Error: ${evt.error}` : 'Run failed',
              timestamp: Date.now(),
            })
          }
          msgs.forEach((m, i) => {
            if (m.role === 'tool' && m.toolStatus === 'running') {
              msgs[i] = { ...m, toolStatus: 'error' }
            }
          })
          cleanup()

          clearInFlight(sid)
          break
        }

        case 'usage.updated': {
          const target = sessions.value.find(s => s.id === sid)
          if (target) {
            target.inputTokens = (evt as any).inputTokens
            target.outputTokens = (evt as any).outputTokens
          }
          break
        }
      }
    }

    // Register handlers in global session map
    registerSessionHandlers(sid, {
      onMessageDelta: (evt) => handleEvent(evt),
      onReasoningDelta: (evt) => handleEvent(evt),
      onThinkingDelta: (evt) => handleEvent(evt),
      onReasoningAvailable: (evt) => handleEvent(evt),
      onToolStarted: (evt) => handleEvent(evt),
      onToolCompleted: (evt) => handleEvent(evt),
      onRunStarted: (evt) => handleEvent(evt),
      onRunCompleted: (evt) => handleEvent(evt),
      onRunFailed: (evt) => handleEvent(evt),
      onCompressionStarted: (evt) => handleEvent(evt),
      onCompressionCompleted: (evt) => handleEvent(evt),
      onUsageUpdated: (evt) => handleEvent(evt),
    })

    // No need to emit resume here — switchSession already did it.
    // Server already joined room and replayed events.
    // Just set up handlers for ongoing streaming events.

    // Mark as streaming so UI shows the indicator
    streamStates.value.set(sid, { abort: cleanup })
  }

  function stopStreaming() {
    const sid = activeSessionId.value
    if (!sid) return
    const ctrl = streamStates.value.get(sid)
    if (ctrl) {
      ctrl.abort()
      const msgs = getSessionMsgs(sid)
      const lastMsg = msgs[msgs.length - 1]
      if (lastMsg?.isStreaming) {
        updateMessage(sid, lastMsg.id, { isStreaming: false })
      }
      streamStates.value.delete(sid)
      serverWorking.value.delete(sid)
    }
    clearInFlight(sid)
  }

  // Tab visibility: re-sync when returning to foreground
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && activeSessionId.value && !isStreaming.value) {
        const sid = activeSessionId.value
        if (sid && !streamStates.value.has(sid)) {
          // Re-load messages via resume (server loads from DB)
          resumeSession(sid, (data) => {
            if (data.messages?.length && activeSession.value) {
              activeSession.value.messages = mapHermesMessages(data.messages as any[])
            }
          })
          resumeInFlightRun(sid)
        }
      }
    })
  }

  // Transient observation of <think> boundaries during active streaming.
  // Not persisted; cleared on session switch. See spec §5.3.
  const thinkingObservation = new Map<string, { startedAt?: number; endedAt?: number }>()

  function getThinkingObservation(messageId: string) {
    return thinkingObservation.get(messageId)
  }

  function noteThinkingDelta(messageId: string, prevContent: string, nextContent: string) {
    const { startedAtBoundary, endedAtBoundary } = detectThinkingBoundary(prevContent, nextContent)
    if (!startedAtBoundary && !endedAtBoundary) return
    const existing = thinkingObservation.get(messageId) || {}
    if (startedAtBoundary && existing.startedAt === undefined) {
      existing.startedAt = Date.now()
    }
    if (endedAtBoundary && existing.endedAt === undefined) {
      existing.endedAt = Date.now()
    }
    thinkingObservation.set(messageId, existing)
  }

  /** 第一次见到某条消息的 reasoning 文本时，标记 startedAt。 */
  function noteReasoningStart(messageId: string) {
    const existing = thinkingObservation.get(messageId) || {}
    if (existing.startedAt === undefined) {
      existing.startedAt = Date.now()
      thinkingObservation.set(messageId, existing)
    }
  }

  /** 内容首次到达（视为推理结束）或显式收到 reasoning.available 时，标记 endedAt。 */
  function noteReasoningEnd(messageId: string) {
    const existing = thinkingObservation.get(messageId)
    if (!existing || existing.startedAt === undefined) return
    if (existing.endedAt === undefined) {
      existing.endedAt = Date.now()
      thinkingObservation.set(messageId, existing)
    }
  }

  function clearProviderFromSessions(provider: string) {
    if (!provider) return
    const target = provider.toLowerCase()
    for (const s of sessions.value) {
      if ((s.provider || '').toLowerCase() === target) {
        s.model = undefined
        s.provider = ''
      }
    }
  }

  function clearThinkingObservationFor(_sessionId: string) {
    // messageId 与 sessionId 的关联未单独持有；方案是切会话时一律清空。
    // 这符合 spec 定义：observation 是"当前会话范围内"的 transient 状态。
    thinkingObservation.clear()
  }

  // 播放消息语音
  function playMessageSpeech(messageId: string, content: string) {
    // 触发自定义事件，让 MessageItem 组件处理播放
    const event = new CustomEvent('auto-play-speech', {
      detail: { messageId, content }
    })
    window.dispatchEvent(event)
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    focusMessageId,
    messages,
    isStreaming,
    isRunActive,
    isSessionLive,
    autoPlaySpeechEnabled,
    compressionState,
    isLoadingSessions,
    sessionsLoaded,
    isLoadingMessages,

    newChat,
    switchSession,
    switchSessionModel,
    addOrUpdateSession,
    clearProviderFromSessions,
    deleteSession,
    sendMessage,
    stopStreaming,
    loadSessions,
    refreshActiveSession,
    getThinkingObservation,
    noteThinkingDelta,
    noteReasoningStart,
    noteReasoningEnd,
    clearThinkingObservationFor,
    setAutoPlaySpeech,
    playMessageSpeech,
  }
})
