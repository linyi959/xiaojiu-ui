<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useMessage } from 'naive-ui'
import { useAppStore } from '@/stores/hermes/app'
import { useChatStore } from '@/stores/hermes/chat'
import { useCommandPalette } from '@/composables/useCommandPalette'

interface CommandItem {
  id: string
  group: string
  title: string
  hint?: string
  icon?: string
  keywords?: string
  action: () => unknown
}

const router = useRouter()
const message = useMessage()
const appStore = useAppStore()
const chatStore = useChatStore()

const { modelGroups, selectedModel, selectedProvider } = storeToRefs(appStore)
const { isOpen, initialQuery, close } = useCommandPalette()

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLDivElement | null>(null)

// —— 基础导航命令（对齐 router） ——
const navItems: CommandItem[] = [
  { id: 'nav.chat', group: '指挥台', title: '打开对话',    hint: 'Chat',    icon: '◐', keywords: 'chat 聊天 对话 conversation', action: () => router.push('/hermes/chat') },
  { id: 'nav.history', group: '指挥台', title: '历史会话',  hint: 'History', icon: '◇', keywords: 'history 历史', action: () => router.push('/hermes/history') },
  { id: 'nav.group', group: '指挥台', title: '群聊',       hint: 'Group',   icon: '◉', keywords: 'group 群聊', action: () => router.push('/hermes/group-chat') },
  { id: 'nav.monitor', group: '作战台', title: '监控面板', hint: 'Monitor', icon: '◎', keywords: 'monitor 监控 dashboard', action: () => router.push('/hermes/monitor') },
  { id: 'nav.jobs',   group: '作战台', title: '任务调度',  hint: 'Jobs',    icon: '◆', keywords: 'jobs 任务 定时', action: () => router.push('/hermes/jobs') },
  { id: 'nav.terminal',group: '作战台', title: '终端',     hint: 'Terminal',icon: '▮', keywords: 'terminal 终端 shell', action: () => router.push('/hermes/terminal') },
  { id: 'nav.memory', group: '认知库', title: '记忆',      hint: 'Memory',  icon: '◈', keywords: 'memory 记忆', action: () => router.push('/hermes/memory') },
  { id: 'nav.files',  group: '认知库', title: '文件',      hint: 'Files',   icon: '▤', keywords: 'files 文件', action: () => router.push('/hermes/files') },
  { id: 'nav.profiles',group: '认知库',title: '档案',      hint: 'Profiles',icon: '◐', keywords: 'profiles 档案 persona', action: () => router.push('/hermes/profiles') },
  { id: 'nav.models', group: '能力',   title: '模型',      hint: 'Models',  icon: '◒', keywords: 'models 模型 llm', action: () => router.push('/hermes/models') },
  { id: 'nav.skills', group: '能力',   title: '技能',      hint: 'Skills',  icon: '◓', keywords: 'skills 技能', action: () => router.push('/hermes/skills') },
  { id: 'nav.gateway',group: '能力',   title: '网关',      hint: 'Gateway', icon: '▨', keywords: 'gateway 网关', action: () => router.push('/hermes/gateways') },
  { id: 'nav.channels',group:'能力',   title: '通道',      hint: 'Channels',icon: '▣', keywords: 'channels 通道', action: () => router.push('/hermes/channels') },
  { id: 'nav.logs',   group: '运维',   title: '日志',      hint: 'Logs',    icon: '▥', keywords: 'logs 日志', action: () => router.push('/hermes/logs') },
  { id: 'nav.usage',  group: '运维',   title: '用量',      hint: 'Usage',   icon: '▧', keywords: 'usage 用量 cost', action: () => router.push('/hermes/usage') },
  { id: 'nav.settings',group:'运维',   title: '设置',      hint: 'Settings',icon: '◌', keywords: 'settings 设置', action: () => router.push('/hermes/settings') },
]

// —— 动作命令（快捷操作） ——
const actionItems = computed<CommandItem[]>(() => [
  {
    id: 'action.new-chat',
    group: '快捷动作',
    title: '新建会话',
    hint: '清空当前上下文',
    icon: '+',
    keywords: 'new chat 新建 会话',
    action: async () => {
      chatStore.newChat()
      if (router.currentRoute.value.name !== 'hermes.chat') {
        router.push('/hermes/chat')
      }
      message.success('会话已开')
    },
  },
  {
    id: 'action.reconnect',
    group: '快捷动作',
    title: '重连网关',
    hint: '刷新 Hermes 健康检查',
    icon: '↻',
    keywords: 'reconnect 重连 health 网关',
    action: async () => {
      await appStore.checkConnection()
      message.info(appStore.connected ? '网关在线' : '网关离线')
    },
  },
])

// —— 模型切换命令（动态生成） ——
const modelItems = computed<CommandItem[]>(() => {
  const items: CommandItem[] = []
  for (const group of modelGroups.value) {
    for (const m of group.models) {
      const isCurrent = selectedModel.value === m && selectedProvider.value === group.provider
      items.push({
        id: `model.${group.provider}.${m}`,
        group: '切换模型',
        title: m,
        hint: `${group.provider}${isCurrent ? ' · 当前' : ''}`,
        icon: isCurrent ? '●' : '○',
        keywords: `${m} ${group.provider} model`,
        action: async () => {
          await appStore.switchModel(m, group.provider)
          message.success(`已切换到 ${m}`)
        },
      })
    }
  }
  return items
})

// —— 合并 + 过滤 ——
const allItems = computed<CommandItem[]>(() => [...actionItems.value, ...navItems, ...modelItems.value])

const filtered = computed<CommandItem[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allItems.value.slice(0, 40)

  // 斜杠指令支持：/model xxx 直接过滤模型
  if (q.startsWith('/model')) {
    const rest = q.slice(6).trim()
    return modelItems.value.filter(i => !rest || i.title.toLowerCase().includes(rest) || (i.keywords || '').toLowerCase().includes(rest))
  }
  if (q.startsWith('/go')) {
    const rest = q.slice(3).trim()
    return navItems.filter(i => !rest || i.title.toLowerCase().includes(rest) || (i.keywords || '').toLowerCase().includes(rest))
  }

  return allItems.value.filter(i => {
    const hay = `${i.title} ${i.hint || ''} ${i.keywords || ''} ${i.group}`.toLowerCase()
    return hay.includes(q)
  }).slice(0, 40)
})

const grouped = computed(() => {
  const map = new Map<string, CommandItem[]>()
  for (const item of filtered.value) {
    if (!map.has(item.group)) map.set(item.group, [])
    map.get(item.group)!.push(item)
  }
  return Array.from(map.entries())
})

// flat index -> item 的映射，用于键盘上下移动
const flatIndex = computed(() => filtered.value)

function runItem(item: CommandItem) {
  try {
    const ret = item.action()
    if (ret instanceof Promise) ret.catch((e) => console.error(e))
  } catch (e) {
    console.error(e)
  }
  close()
}

function onKeydown(e: KeyboardEvent) {
  if (!isOpen.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, flatIndex.value.length - 1)
    scrollToActive()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
    scrollToActive()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const it = flatIndex.value[activeIndex.value]
    if (it) runItem(it)
  }
}

function scrollToActive() {
  nextTick(() => {
    const el = listRef.value?.querySelector(`[data-idx="${activeIndex.value}"]`) as HTMLElement | null
    if (el) el.scrollIntoView({ block: 'nearest' })
  })
}

watch(isOpen, (open) => {
  if (open) {
    query.value = initialQuery.value || ''
    activeIndex.value = 0
    nextTick(() => inputRef.value?.focus())
  }
})

watch(query, () => {
  activeIndex.value = 0
})

// item 在 filtered 中的绝对 index
function indexOf(item: CommandItem) {
  return flatIndex.value.findIndex(i => i.id === item.id)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cmdk">
      <div
        v-if="isOpen"
        class="cmdk-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="指令面板"
        @click.self="close"
        @keydown="onKeydown"
      >
        <div class="cmdk-panel" tabindex="-1">
          <header class="cmdk-header">
            <span class="cmdk-prompt">/</span>
            <input
              ref="inputRef"
              v-model="query"
              class="cmdk-input"
              placeholder="输入指令、页面、模型名……支持 /go /model"
              autocomplete="off"
              spellcheck="false"
            />
            <kbd class="cmdk-kbd">ESC</kbd>
          </header>

          <div ref="listRef" class="cmdk-list">
            <template v-if="grouped.length">
              <div v-for="[gname, items] in grouped" :key="gname" class="cmdk-group">
                <div class="cmdk-group-label">{{ gname }}</div>
                <button
                  v-for="item in items"
                  :key="item.id"
                  :data-idx="indexOf(item)"
                  class="cmdk-item"
                  :class="{ 'is-active': indexOf(item) === activeIndex }"
                  @mouseenter="activeIndex = indexOf(item)"
                  @click="runItem(item)"
                >
                  <span class="item-icon">{{ item.icon || '›' }}</span>
                  <span class="item-title">{{ item.title }}</span>
                  <span v-if="item.hint" class="item-hint">{{ item.hint }}</span>
                </button>
              </div>
            </template>
            <div v-else class="cmdk-empty">
              没有匹配的指令
            </div>
          </div>

          <footer class="cmdk-footer">
            <span><kbd>↑↓</kbd> 选择</span>
            <span><kbd>↵</kbd> 执行</span>
            <span><kbd>ESC</kbd> 关闭</span>
            <span class="spacer" />
            <span class="footer-tip">⌘K 随时唤出 · 小九在听</span>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.cmdk-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 14vh;
  background: rgba(2, 6, 16, 0.68);
  backdrop-filter: blur(14px) saturate(1.2);
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
}

.cmdk-panel {
  width: min(640px, calc(100vw - 48px));
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgba(12, 22, 42, 0.92), rgba(4, 9, 20, 0.88));
  border: 1px solid rgba(99, 231, 255, 0.32);
  border-radius: 16px;
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.55),
    0 0 0 1px rgba(99, 231, 255, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  overflow: hidden;
  color: #edf7ff;
  outline: none;
}

.cmdk-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(99, 231, 255, 0.14);
  background: linear-gradient(180deg, rgba(99, 231, 255, 0.06), transparent);
}

.cmdk-prompt {
  font-family: 'Fira Code', monospace;
  color: #63e7ff;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-shadow: 0 0 12px rgba(99, 231, 255, 0.45);
}

.cmdk-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #edf7ff;
  font-size: 15px;
  letter-spacing: 0.01em;

  &::placeholder {
    color: #7f90aa;
  }
}

.cmdk-kbd,
kbd {
  font-family: 'Fira Code', monospace;
  font-size: 10.5px;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(99, 231, 255, 0.2);
  background: rgba(99, 231, 255, 0.06);
  color: #cbe5ff;
  letter-spacing: 0.04em;
}

.cmdk-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;

  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb {
    background: rgba(99, 231, 255, 0.18);
    border-radius: 3px;
  }
}

.cmdk-group {
  padding: 4px 0;
}

.cmdk-group-label {
  padding: 6px 18px 4px;
  font-size: 10.5px;
  letter-spacing: 0.18em;
  color: #7f90aa;
  text-transform: uppercase;
  font-weight: 600;
}

.cmdk-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 18px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: #cbe5ff;
  font-size: 13.5px;
  text-align: left;
  transition: background 0.15s ease, color 0.15s ease;

  &.is-active {
    background: linear-gradient(90deg, rgba(99, 231, 255, 0.14), rgba(77, 141, 255, 0.08));
    color: #edf7ff;
    box-shadow: inset 3px 0 0 #63e7ff;
  }

  .item-icon {
    width: 20px;
    color: #63e7ff;
    font-family: 'Fira Code', monospace;
    text-align: center;
  }

  .item-title {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-hint {
    color: #7f90aa;
    font-size: 11.5px;
    font-family: 'Fira Code', monospace;
    letter-spacing: 0.02em;
  }
}

.cmdk-empty {
  padding: 32px 18px;
  text-align: center;
  color: #7f90aa;
  font-size: 13px;
}

.cmdk-footer {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 18px;
  border-top: 1px solid rgba(99, 231, 255, 0.12);
  background: rgba(4, 9, 20, 0.5);
  color: #7f90aa;
  font-size: 11px;
  letter-spacing: 0.03em;

  .spacer { flex: 1; }
  .footer-tip { color: #63e7ff; letter-spacing: 0.05em; }
}

/* Transition */
.cmdk-enter-active,
.cmdk-leave-active {
  transition: opacity 0.18s ease;

  .cmdk-panel {
    transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease;
  }
}
.cmdk-enter-from,
.cmdk-leave-to {
  opacity: 0;

  .cmdk-panel {
    opacity: 0;
    transform: translateY(-8px) scale(0.98);
  }
}
</style>
