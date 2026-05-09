<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useChatStore } from '@/stores/hermes/chat'
import { useAppStore } from '@/stores/hermes/app'

const chatStore = useChatStore()
const appStore = useAppStore()
const route = useRoute()

const assetBase = '/xiaojiu-presence/openroom'

type PresenceState = 'listening' | 'loading' | 'thinking' | 'offline' | 'error'

const COLLAPSE_KEY = 'xr_presence_collapsed'
const collapsed = ref<boolean>(localStorage.getItem(COLLAPSE_KEY) === '1')

function toggleCollapse() { collapsed.value = !collapsed.value }

const activeTool = computed(() => {
  return [...chatStore.messages].reverse().find(message => message.role === 'tool' && message.toolStatus === 'running')
})

const lastSystemError = computed(() => {
  return [...chatStore.messages].reverse().find(message => {
    if (message.role !== 'system') return false
    return /error|failed|失败|错误/i.test(message.content || '')
  })
})

const presenceState = computed<PresenceState>(() => {
  if (!appStore.connected) return 'offline'
  if (chatStore.isStreaming) return 'thinking'
  if (chatStore.isLoadingMessages || chatStore.isLoadingSessions) return 'loading'
  if (lastSystemError.value) return 'error'
  return 'listening'
})

const stateCopy = computed(() => {
  if (presenceState.value === 'thinking') {
    if (activeTool.value?.toolName) return activeTool.value.toolName
    return '在想你这句'
  }
  if (presenceState.value === 'loading') return '刚连上这边'
  if (presenceState.value === 'offline') return '暂时断开'
  if (presenceState.value === 'error') return '刚才卡了一下'
  return route.name === 'hermes.chat' ? '我在听' : '安静待命'
})

const moodLabel = computed(() => {
  if (presenceState.value === 'thinking') return activeTool.value ? 'ACTING' : 'THINKING'
  if (presenceState.value === 'loading') return 'SYNCING'
  if (presenceState.value === 'offline') return 'OFFLINE'
  if (presenceState.value === 'error') return 'RECOVERING'
  return route.name === 'hermes.chat' ? 'LISTENING' : 'STANDBY'
})

const moodColor = computed(() => {
  switch (presenceState.value) {
    case 'thinking': return '#a98cff'
    case 'loading':  return '#63e7ff'
    case 'error':    return '#fde68a'
    case 'offline':  return '#fb7185'
    default:         return '#63e7ff'
  }
})

const linkLabel = computed(() => (appStore.connected ? 'ONLINE' : 'OFFLINE'))

// 链路信号强度（模拟延迟指示器，真实场景可接 websocket latency）
const linkStrength = computed(() => {
  if (!appStore.connected) return 0
  return 3 // 0-4 格
})

// 本会话消息速率（条/分钟）
const messageRate = computed(() => {
  const msgs = chatStore.messages
  if (msgs.length < 2) return null
  const first = msgs[0]
  const last = msgs[msgs.length - 1]
  if (!first?.timestamp || !last?.timestamp) return null
  const diff = new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()
  if (diff <= 0) return null
  const rate = Math.round((msgs.length / diff) * 60000)
  if (rate < 0.5) return null
  if (rate < 2) return '<2'
  return `${rate}`
})

// 工具活动详细描述（中文）
const toolActivityLabel = computed(() => {
  if (!activeTool.value?.toolName) return ''
  const name = activeTool.value.toolName
  if (name.includes('web_search')) return '正在搜索网络'
  if (name.includes('terminal')) return '正在执行终端'
  if (name.includes('file')) return '正在读写文件'
  if (name.includes('memory')) return '正在访问记忆'
  if (name.includes('code')) return '正在编写代码'
  return `执行 ${name}`
})

// 上下文占用（估算，基于消息数量）
const contextUsage = computed(() => {
  const n = chatStore.messages.length
  const usage = Math.min(Math.round((n / 100) * 100), 100)
  return usage
})

const characterVideo = computed(() => {
  switch (presenceState.value) {
    case 'thinking': return `${assetBase}/happy.mp4`
    case 'loading':  return `${assetBase}/happy.mp4`
    case 'error':    return `${assetBase}/angry.mp4`
    case 'offline':  return `${assetBase}/default.mp4`
    case 'listening':
    default:
      return route.name === 'hermes.chat' ? `${assetBase}/shy.mp4` : `${assetBase}/default.mp4`
  }
})

// bubbleCopy: 用于视频上方气泡
const bubbleCopy = computed(() => {
  if (presenceState.value === 'thinking') {
    if (activeTool.value?.toolName) return `${activeTool.value.toolName}…`
    return '我想一下…'
  }
  if (presenceState.value === 'loading') return '刚接上。'
  if (presenceState.value === 'offline') return '断了一下。'
  if (presenceState.value === 'error') return '刚才那步错了。'
  if (route.name === 'hermes.chat') return '说吧。'
  return ''
})

// 会话情报 computed
const messageCount = computed(() => {
  const n = chatStore.activeSession?.messageCount ?? chatStore.messages.length ?? 0
  return n
})
const lastMessageTime = computed(() => {
  const msgs = chatStore.messages
  if (!msgs.length) return null
  const last = msgs[msgs.length - 1]
  if (!last?.timestamp) return null
  const d = new Date(last.timestamp)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
})
const modelLabel = computed(() => appStore.selectedModel || '—')
const activityToolName = computed(() => activeTool.value?.toolName || '')

// 顶部舱顶计时：每秒刷新的 HH:mm:ss 格式
const roofTimer = ref('00:00:00')
let roofTimerInterval: ReturnType<typeof setInterval> | null = null

function updateRoofTimer() {
  const msgs = chatStore.messages
  if (!msgs.length) { roofTimer.value = '00:00:00'; return }
  const first = msgs[0]
  if (!first?.timestamp) { roofTimer.value = '00:00:00'; return }
  const diff = Date.now() - new Date(first.timestamp).getTime()
  if (diff < 0) { roofTimer.value = '00:00:00'; return }
  const totalSec = Math.floor(diff / 1000)
  const hh = Math.floor(totalSec / 3600)
  const mm = Math.floor((totalSec % 3600) / 60)
  const ss = totalSec % 60
  roofTimer.value = `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
}

// 任务计时：工具运行中每秒刷新 MM:SS
const taskDuration = ref('00:00')
let taskTimerInterval: ReturnType<typeof setInterval> | null = null

function updateTaskTimer() {
  const tool = activeTool.value
  if (!tool?.timestamp) { taskDuration.value = '00:00'; return }
  const diff = Date.now() - new Date(tool.timestamp).getTime()
  if (diff < 0) { taskDuration.value = '00:00'; return }
  const totalSec = Math.floor(diff / 1000)
  const mm = Math.floor(totalSec / 60)
  const ss = totalSec % 60
  taskDuration.value = `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
}

function startTaskTimer() {
  stopTaskTimer()
  updateTaskTimer()
  taskTimerInterval = setInterval(updateTaskTimer, 1000)
}

function stopTaskTimer() {
  if (taskTimerInterval !== null) { clearInterval(taskTimerInterval); taskTimerInterval = null }
}

watch(activeTool, (newTool) => {
  if (newTool) startTaskTimer()
  else stopTaskTimer()
})

watch(collapsed, v => {
  try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0') } catch { /* ignore */ }
})

onMounted(() => {
  updateRoofTimer()
  roofTimerInterval = setInterval(updateRoofTimer, 1000)
  if (activeTool.value) startTaskTimer()
})

onUnmounted(() => {
  if (roofTimerInterval !== null) clearInterval(roofTimerInterval)
  stopTaskTimer()
})
</script>

<template>
  <aside
    class="xiaojiu-presence-dock"
    :class="[presenceState, { 'is-collapsed': collapsed }]"
    aria-label="小九在场舱"
  >
    <button
      class="collapse-trigger"
      type="button"
      :title="collapsed ? '展开在场舱' : '收起在场舱'"
      :aria-pressed="collapsed"
      @click="toggleCollapse"
    >
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path
          v-if="collapsed"
          d="M10 3L5 8l5 5"
          stroke="currentColor"
          stroke-width="1.6"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          v-else
          d="M6 3l5 5-5 5"
          stroke="currentColor"
          stroke-width="1.6"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <div class="presence-needle" />
    <div class="side-energy side-energy-left" />
    <div class="side-energy side-energy-right" />

    <header v-if="!collapsed" class="presence-head">
      <!-- 舱顶计时行 -->
      <div class="roof-timer-row">
        <span class="roof-play" :style="{ color: moodColor }">▶</span>
        <span class="roof-timer-value" :style="{ color: moodColor }">{{ roofTimer }}</span>
        <span class="roof-sep" />
        <span class="roof-sess-tag">SESS</span>
        <span class="roof-online-tag" :class="{ 'is-offline': !appStore.connected }">
          {{ appStore.connected ? 'ONLINE' : 'OFFL' }}
        </span>
      </div>

      <div class="head-energy-bar" :style="{ background: moodColor }" />

      <div class="presence-state-row">
        <span class="state-badge" :style="{ color: moodColor }">
          <i class="state-dot" />
          {{ moodLabel }}
        </span>
        <span class="presence-divider" />
        <span class="link-badge" :class="{ 'is-offline': !appStore.connected }">
          <i class="link-dot" />
          {{ linkLabel }}
        </span>
        <!-- 信号强度阶梯 -->
        <span class="signal-bars" :class="{ 'is-offline': !appStore.connected }">
          <i v-for="n in 4" :key="n" class="signal-bar" :class="{ active: appStore.connected && n <= linkStrength }" />
        </span>
      </div>

      <div class="session-info-strip">
        <div class="session-info-item">
          <span class="info-label">模型</span>
          <span class="info-value model-tag">{{ modelLabel }}</span>
        </div>
        <div class="session-info-divider" />
        <div class="session-info-item">
          <span class="info-label">消息</span>
          <span class="info-value">{{ messageCount }} 条</span>
        </div>
        <div class="session-info-divider" />
        <div v-if="messageRate" class="session-info-item">
          <span class="info-label">速率</span>
          <span class="info-value rate-tag">{{ messageRate }}/分</span>
        </div>
        <div v-if="messageRate && lastMessageTime" class="session-info-divider" />
        <div v-if="lastMessageTime" class="session-info-item">
          <span class="info-label">最后</span>
          <span class="info-value">{{ lastMessageTime }}</span>
        </div>
      </div>
    </header>

    <section class="presence-capsule" aria-label="小九透明生命舱">
      <div class="capsule-backlight" />
      <div class="capsule-shell" />
      <div class="capsule-sheen" />
      <div class="scan-ring ring-outer" />
      <div class="scan-ring ring-inner" />
      <div class="vertical-scan" />

      <div class="mini-telemetry telemetry-left">
        <span />
        <span />
        <span />
      </div>

      <figure class="character-stage">
        <div class="character-frame">
          <span class="frame-notch frame-notch-left" />
          <span class="frame-notch frame-notch-right" />
          <span class="frame-spine frame-spine-top" />
          <span class="frame-spine frame-spine-bottom" />
          <div class="character-frame-inner">
            <div class="frame-vignette" />
            <video
              class="character-video"
              :src="characterVideo"
              autoplay
              muted
              loop
              playsinline
            />
          </div>
        </div>
        <transition name="bubble-fade">
          <div
            v-if="!collapsed && bubbleCopy"
            class="character-bubble"
            :class="[`bubble-${presenceState}`]"
            :aria-live="presenceState === 'error' ? 'assertive' : 'polite'"
          >
            <span class="bubble-dot" />
            <span class="bubble-text">{{ bubbleCopy }}</span>
          </div>
        </transition>
      </figure>

      <div class="floor-light" />
      <div class="floor-reflection" />
    </section>

    <footer v-if="!collapsed" class="presence-footer">
      <div class="footer-energy-bar" :style="{ background: moodColor }" />

      <!-- 任务计时行（工具运行时显示） -->
      <div v-if="activityToolName" class="task-timer-row">
        <span class="task-timer-label" :style="{ color: moodColor }">▶ TASK</span>
        <span class="task-timer-value" :style="{ color: moodColor }">{{ taskDuration || '00:00' }}</span>
        <span class="task-timer-desc">{{ toolActivityLabel }}</span>
      </div>

      <!-- 底座数据行：mood + 上下文占用（同区） -->
      <div class="pedestal-data-row">
        <span class="mood-dot" :style="{ background: moodColor, boxShadow: `0 0 8px ${moodColor}` }" />
        <span class="mood-text">{{ stateCopy }}</span>
        <span class="pedestal-sep" />
        <span class="context-label">CONTEXT</span>
        <div class="context-bar-track">
          <div
            class="context-bar-fill"
            :style="{
              width: contextUsage + '%',
              background: contextUsage > 80 ? '#fde68a' : '#a98cff',
              boxShadow: `0 0 6px ${contextUsage > 80 ? '#fde68a' : '#a98cff'}`
            }"
          />
        </div>
        <span class="context-value">{{ contextUsage }}%</span>
      </div>

      <!-- 上下文占用进度条（保留独立行，高密度时收起） -->
      <div class="context-meter-row">
        <span class="context-label">上下文</span>
        <div class="context-bar-track">
          <div
            class="context-bar-fill"
            :style="{
              width: contextUsage + '%',
              background: contextUsage > 80 ? '#fde68a' : '#a98cff',
              boxShadow: `0 0 6px ${contextUsage > 80 ? '#fde68a' : '#a98cff'}`
            }"
          />
        </div>
        <span class="context-value">{{ contextUsage }}%</span>
      </div>
    </footer>

    <div v-else class="collapsed-pulse" :title="stateCopy">
      <span class="pulse-dot" />
    </div>
  </aside>
</template>

<style scoped lang="scss">
.xiaojiu-presence-dock {
  --xr-cyan: #63e7ff;
  --xr-blue: #4d8dff;
  --xr-violet: #a98cff;
  --xr-text: #edf7ff;
  --xr-soft: #b9c9de;
  --xr-muted: #7f90aa;
  --xr-danger: #fb7185;
  --xr-warning: #ffd37a;

  position: relative;
  width: 264px;
  flex-shrink: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 12px;
  padding: 16px 14px 14px;
  overflow: hidden;
  border-left: 1px solid rgba(99, 231, 255, 0.18);
  color: var(--xr-text);
  background:
    radial-gradient(circle at 52% 18%, rgba(99, 231, 255, 0.15), transparent 30%),
    radial-gradient(circle at 85% 55%, rgba(169, 140, 255, 0.12), transparent 36%),
    linear-gradient(180deg, rgba(2, 5, 16, 0.96), rgba(5, 10, 24, 0.94));
  box-shadow: -18px 0 64px rgba(0, 0, 0, 0.3), inset 1px 0 0 rgba(255, 255, 255, 0.035);
  transition: width 0.26s cubic-bezier(0.4, 0, 0.2, 1);
}

.xiaojiu-presence-dock.is-collapsed {
  width: 56px;
  padding: 42px 6px 10px;
  gap: 10px;
  grid-template-rows: minmax(0, 1fr) auto;
}

.collapse-trigger {
  position: absolute;
  top: 10px;
  left: 8px;
  z-index: 15;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid rgba(99, 231, 255, 0.22);
  border-radius: 50%;
  color: var(--xr-cyan);
  background: rgba(3, 8, 19, 0.82);
  cursor: pointer;
  transition: color 0.2s, background 0.2s, border-color 0.2s, transform 0.2s;

  &:hover {
    color: #fff;
    background: rgba(99, 231, 255, 0.12);
    border-color: rgba(99, 231, 255, 0.48);
    transform: scale(1.06);
  }
}

.is-collapsed .collapse-trigger {
  left: 50%;
  transform: translateX(-50%);
  &:hover { transform: translateX(-50%) scale(1.06); }
}

.presence-needle {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.22;
  background-image:
    linear-gradient(rgba(99, 231, 255, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99, 231, 255, 0.04) 1px, transparent 1px),
    linear-gradient(180deg, transparent, rgba(99, 231, 255, 0.08) 48%, transparent 52%);
  background-size: 34px 34px, 34px 34px, 100% 180px;
  mask-image: radial-gradient(circle at center, black, transparent 86%);
}

.side-energy {
  position: absolute;
  top: 82px;
  bottom: 84px;
  width: 1px;
  pointer-events: none;
  background: linear-gradient(180deg, transparent, rgba(99, 231, 255, 0.52), rgba(169, 140, 255, 0.28), transparent);
  opacity: 0.22;
  filter: drop-shadow(0 0 4px rgba(99, 231, 255, 0.2));
}

.side-energy-left { left: 13px; }
.side-energy-right { right: 13px; }

.is-collapsed .side-energy { display: none; }

.presence-head,
.presence-capsule,
.presence-footer,
.collapsed-pulse {
  position: relative;
  z-index: 1;
}

.presence-head {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 4px 4px;
  min-height: 72px;
}

.roof-timer-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 2px;
}

.roof-play {
  font-size: 7px;
  flex-shrink: 0;
  opacity: 0.8;
}

.roof-timer-value {
  font-family: 'Fira Code', monospace;
  font-size: 9px;
  letter-spacing: 0.06em;
  flex-shrink: 0;
}

.roof-sep {
  width: 12px;
  height: 1px;
  background: rgba(99, 231, 255, 0.2);
  flex-shrink: 0;
  margin: 0 2px;
}

.roof-sess-tag {
  font-family: 'Fira Code', monospace;
  font-size: 7px;
  letter-spacing: 0.14em;
  color: rgba(99, 231, 255, 0.45);
  flex-shrink: 0;
}

.roof-online-tag {
  font-family: 'Fira Code', monospace;
  font-size: 7px;
  letter-spacing: 0.12em;
  color: rgba(99, 231, 255, 0.75);
  flex-shrink: 0;

  &.is-offline {
    color: rgba(251, 113, 133, 0.65);
  }
}

.presence-state-row {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  padding-top: 2px;
}

.state-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: 'Fira Code', monospace;
  font-size: 8px;
  letter-spacing: 0.16em;
  text-transform: uppercase;

  .state-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 8px currentColor;
    animation: blink 1.6s ease-in-out infinite;
  }
}

.link-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: 'Fira Code', monospace;
  font-size: 8px;
  letter-spacing: 0.14em;
  color: rgba(99, 231, 255, 0.65);

  .link-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #63e7ff;
    box-shadow: 0 0 8px rgba(99, 231, 255, 0.7);
  }

  &.is-offline {
    color: rgba(251, 113, 133, 0.65);
    .link-dot {
      background: #fb7185;
      box-shadow: 0 0 8px rgba(251, 113, 133, 0.7);
    }
  }
}

.signal-bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
  max-width: 20px;
  overflow: hidden;
}

.signal-bar {
  width: 3px;
  background: rgba(99, 231, 255, 0.2);
  border-radius: 1px;
  transition: background 0.3s ease, box-shadow 0.3s ease;

  &:nth-child(1) { height: 4px; }
  &:nth-child(2) { height: 6px; }
  &:nth-child(3) { height: 8px; }
  &:nth-child(4) { height: 10px; }

  &.active {
    background: #63e7ff;
    box-shadow: 0 0 6px rgba(99, 231, 255, 0.8);
  }
}

.rate-tag {
  color: rgba(99, 231, 255, 0.85) !important;
}

.presence-divider {
  width: 12px;
  height: 1px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(99, 231, 255, 0.28), rgba(99, 231, 255, 0.06));
  flex-shrink: 0;
}

.head-energy-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 999px 999px 0 0;
  opacity: 0.85;
  background: linear-gradient(90deg, transparent 0%, v-bind(moodColor) 40%, v-bind(moodColor) 70%, transparent 100%);
  box-shadow: 0 0 12px v-bind(moodColor);
}

.session-info-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0;
  padding: 1px 0 3px;
  row-gap: 2px;
}

.session-info-item {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

.info-label {
  font-family: 'PingFang SC', 'Helvetica Neue', sans-serif;
  font-size: 8px;
  color: rgba(148, 163, 184, 0.5);
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.info-value {
  font-family: 'Fira Code', 'Courier New', monospace;
  font-size: 8px;
  color: rgba(203, 213, 225, 0.7);
  letter-spacing: 0.02em;
  max-width: 56px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-tag {
  max-width: 52px;
  color: rgba(99, 231, 255, 0.85);
}

.rate-tag {
  color: rgba(99, 231, 255, 0.85) !important;
}

.session-info-divider {
  width: 1px;
  height: 8px;
  background: rgba(99, 231, 255, 0.15);
  margin: 0 5px;
  flex-shrink: 0;
}

.presence-footer {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding-top: 4px;
}

.footer-energy-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  border-radius: 0 0 999px 999px;
  opacity: 0.6;
  background: linear-gradient(90deg, transparent 0%, v-bind(moodColor) 40%, v-bind(moodColor) 70%, transparent 100%);
  box-shadow: 0 0 8px v-bind(moodColor);
}

.footer-mood-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0 2px;
  border-top: 1px solid rgba(99, 231, 255, 0.08);
}

.task-timer-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 0 3px;
  border-top: 1px solid rgba(169, 140, 255, 0.1);
}

.task-timer-label {
  font-family: 'Fira Code', monospace;
  font-size: 8px;
  letter-spacing: 0.1em;
  flex-shrink: 0;
}

.task-timer-value {
  font-family: 'Fira Code', monospace;
  font-size: 9px;
  letter-spacing: 0.06em;
  flex-shrink: 0;
}

.task-timer-desc {
  font-family: 'PingFang SC', 'Helvetica Neue', sans-serif;
  font-size: 8px;
  color: rgba(148, 163, 184, 0.55);
  letter-spacing: 0.03em;
  flex-shrink: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pedestal-data-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 0 2px;
  flex-wrap: nowrap;
}

.pedestal-sep {
  width: 1px;
  height: 8px;
  background: rgba(99, 231, 255, 0.15);
  flex-shrink: 0;
  margin: 0 2px;
}

.mood-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
  animation: blink 2s ease-in-out infinite;
}

.mood-text {
  font-family: 'PingFang SC', 'Helvetica Neue', sans-serif;
  font-size: 10px;
  color: rgba(203, 213, 225, 0.72);
  letter-spacing: 0.03em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.footer-activity-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 0;
  padding: 3px 0 5px;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.activity-label {
  font-family: 'PingFang SC', 'Helvetica Neue', sans-serif;
  font-size: 9px;
  color: rgba(148, 163, 184, 0.5);
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.activity-value {
  font-family: 'Fira Code', 'Courier New', monospace;
  font-size: 9px;
  color: rgba(169, 140, 255, 0.8);
  letter-spacing: 0.02em;
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.footer-divider {
  width: 1px;
  height: 10px;
  background: rgba(169, 140, 255, 0.2);
  margin: 0 6px;
  flex-shrink: 0;
}

.activity-desc {
  font-family: 'PingFang SC', 'Helvetica Neue', sans-serif;
  font-size: 9px;
  color: rgba(148, 163, 184, 0.6);
  letter-spacing: 0.03em;
  flex-shrink: 0;
}

.activity-name {
  font-family: 'Fira Code', monospace;
  font-size: 9px;
  color: rgba(169, 140, 255, 0.85);
  letter-spacing: 0.02em;
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
}

.context-meter-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 0 4px;
  border-top: 1px solid rgba(99, 231, 255, 0.05);
}

.context-label {
  font-family: 'PingFang SC', 'Helvetica Neue', sans-serif;
  font-size: 9px;
  color: rgba(148, 163, 184, 0.5);
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.context-bar-track {
  flex: 1;
  height: 3px;
  border-radius: 999px;
  background: rgba(169, 140, 255, 0.12);
  overflow: hidden;
}

.context-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.4s ease, background 0.3s ease;
}

.context-value {
  font-family: 'Fira Code', monospace;
  font-size: 8px;
  color: rgba(169, 140, 255, 0.7);
  letter-spacing: 0.04em;
  flex-shrink: 0;
  min-width: 24px;
  text-align: right;
}

.is-collapsed .presence-footer { display: none; }

.presence-capsule {
  position: relative;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 2px 0 0;
}

.is-collapsed .presence-capsule {
  min-height: 0;
  height: 100%;
}

.capsule-backlight {
  position: absolute;
  width: 220px;
  height: 356px;
  border-radius: 48% 48% 42% 42%;
  background:
    radial-gradient(circle at 50% 18%, rgba(99, 231, 255, 0.16), transparent 34%),
    radial-gradient(circle at 50% 58%, rgba(77, 141, 255, 0.1), transparent 54%);
  filter: blur(1px);
}

.capsule-shell {
  position: absolute;
  width: 214px;
  height: 364px;
  border-radius: 48% 48% 42% 42% / 18% 18% 24% 24%;
  border: 1px solid rgba(226, 246, 255, 0.1);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.028), rgba(255, 255, 255, 0.01) 24%, transparent 58%),
    radial-gradient(circle at 50% 8%, rgba(255, 255, 255, 0.08), transparent 26%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    inset 24px 0 44px rgba(99, 231, 255, 0.03),
    inset -16px 0 38px rgba(169, 140, 255, 0.025),
    0 0 0 1px rgba(99, 231, 255, 0.02);
  pointer-events: none;
  z-index: 1;
}

.capsule-sheen {
  position: absolute;
  width: 198px;
  height: 334px;
  border-radius: 48% 48% 42% 42% / 18% 18% 24% 24%;
  background: linear-gradient(110deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.018) 22%, transparent 36%);
  opacity: 0.28;
  transform: translateX(-18px) skewX(-8deg);
  filter: blur(1px);
  pointer-events: none;
  z-index: 2;
}

.scan-ring {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  transform-style: preserve-3d;
}

.ring-outer {
  width: 226px;
  height: 226px;
  border: 1px solid rgba(99, 231, 255, 0.22);
  border-top-color: rgba(99, 231, 255, 0.82);
  border-right-color: rgba(169, 140, 255, 0.34);
  animation: spin 22s linear infinite;
}

.ring-inner {
  width: 146px;
  height: 146px;
  border: 1px solid rgba(169, 140, 255, 0.16);
  border-left-color: rgba(99, 231, 255, 0.38);
  border-bottom-color: rgba(169, 140, 255, 0.24);
  animation: spin 14s linear reverse infinite;
}

.is-collapsed {
  .ring-outer { width: 48px; height: 48px; }
  .ring-inner { width: 34px; height: 34px; }
  .capsule-backlight { width: 64px; height: 110px; }
  .capsule-shell { width: 54px; height: 100px; }
  .capsule-sheen { width: 46px; height: 92px; }
  .vertical-scan { width: 42px; height: 140px; }
  .mini-telemetry { display: none; }
}

.vertical-scan {
  position: absolute;
  width: 188px;
  height: 394px;
  border-radius: 999px;
  border-left: 1px solid rgba(99, 231, 255, 0.16);
  border-right: 1px solid rgba(169, 140, 255, 0.13);
  opacity: 0.48;
}

.mini-telemetry {
  position: absolute;
  top: 112px;
  z-index: 5;
  display: grid;
  gap: 9px;
  opacity: 0.17;

  span {
    display: block;
    width: 26px;
    height: 2px;
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, var(--xr-cyan));
    box-shadow: 0 0 10px rgba(99, 231, 255, 0.28);
  }
}

.telemetry-left {
  left: 12px;

  span:nth-child(2) { width: 38px; }
  span:nth-child(3) { width: 18px; }
}

.character-stage {
  position: relative;
  z-index: 4;
  width: 218px;
  height: 426px;
  margin: -10px 0 -14px;
  display: grid;
  place-items: center;
  overflow: visible;
  background: transparent;
  border: 0;
  border-radius: 0;
  filter: drop-shadow(0 18px 34px rgba(0, 0, 0, 0.28));
  transition: width 0.26s ease, height 0.26s ease, margin 0.26s ease;
}

.character-frame {
  position: relative;
  width: 202px;
  height: 390px;
  padding: 10px 10px 11px;
  border-radius: 34px 34px 30px 30px;
  background:
    linear-gradient(180deg, rgba(236, 248, 255, 0.18), rgba(99, 231, 255, 0.07) 18%, rgba(10, 18, 34, 0.54) 58%, rgba(5, 9, 19, 0.82) 100%);
  border: 1px solid rgba(190, 230, 255, 0.2);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.13),
    inset 0 0 0 1px rgba(99, 231, 255, 0.045),
    inset 0 -18px 28px rgba(2, 6, 16, 0.12),
    0 16px 36px rgba(0, 0, 0, 0.3),
    0 0 20px rgba(99, 231, 255, 0.055);
}

.character-frame::before {
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: 28px 28px 25px 25px;
  border: 1px solid rgba(226, 246, 255, 0.09);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.016),
    inset 0 18px 24px rgba(255, 255, 255, 0.02);
  pointer-events: none;
}

.character-frame::after {
  content: '';
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: -10px;
  height: 20px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(99, 231, 255, 0.14), rgba(77, 141, 255, 0.045) 48%, transparent 78%);
  filter: blur(8px);
  opacity: 0.92;
  pointer-events: none;
}

.frame-notch {
  position: absolute;
  top: 112px;
  width: 8px;
  height: 66px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(226, 246, 255, 0.16), rgba(99, 231, 255, 0.04), rgba(3, 8, 18, 0.34));
  opacity: 0.72;
  pointer-events: none;
}

.frame-notch::after {
  content: '';
  position: absolute;
  inset: 12px 2px;
  border-radius: 999px;
  background: rgba(2, 6, 16, 0.34);
}

.frame-notch-left {
  left: -3px;
}

.frame-notch-right {
  right: -3px;
}

.frame-spine {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 56px;
  border-radius: 999px;
  pointer-events: none;
}

.frame-spine-top {
  top: 6px;
  height: 1px;
  background: linear-gradient(90deg, rgba(99, 231, 255, 0.02), rgba(226, 246, 255, 0.34), rgba(99, 231, 255, 0.02));
}

.frame-spine-bottom {
  bottom: 7px;
  height: 1px;
  background: linear-gradient(90deg, rgba(99, 231, 255, 0.02), rgba(99, 231, 255, 0.26), rgba(99, 231, 255, 0.02));
}

.character-frame-inner {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 26px 26px 23px 23px;
  background: linear-gradient(180deg, rgba(6, 12, 24, 0.4), rgba(4, 8, 18, 0.8));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.045),
    inset 0 -28px 44px rgba(3, 7, 18, 0.16);
}

.frame-vignette {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.045), transparent 16%, transparent 82%, rgba(3, 7, 18, 0.12) 100%),
    radial-gradient(circle at 50% 4%, rgba(255, 255, 255, 0.12), transparent 22%),
    linear-gradient(90deg, rgba(3, 7, 18, 0.1), transparent 12%, transparent 88%, rgba(3, 7, 18, 0.08));
}

.is-collapsed .character-stage {
  width: 40px;
  height: 71px;
  filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.32));
}

.is-collapsed .character-frame {
  width: 38px;
  height: 66px;
  padding: 3px;
  border-radius: 14px;
}

.is-collapsed .character-frame::before,
.is-collapsed .character-frame::after,
.is-collapsed .frame-notch,
.is-collapsed .frame-spine,
.is-collapsed .frame-vignette {
  display: none;
}

.is-collapsed .character-frame-inner {
  border-radius: 11px;
}

.character-video {
  position: absolute;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 7%;
  transform: scale(1.015);
  filter: saturate(1.01) contrast(1);
}

.character-stage::before {
  content: '';
  position: absolute;
  inset: auto 38px 4px;
  height: 34px;
  z-index: 1;
  pointer-events: none;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(99, 231, 255, 0.12), rgba(77, 141, 255, 0.04) 48%, transparent 78%);
  filter: blur(11px);
}

.character-stage::after {
  content: '';
  position: absolute;
  top: 18px;
  bottom: 18px;
  left: 18px;
  right: 18px;
  z-index: 3;
  pointer-events: none;
  border-radius: 32px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.034), transparent 11%, transparent 87%, rgba(3, 7, 18, 0.1) 100%),
    linear-gradient(90deg, rgba(255, 255, 255, 0.022), transparent 10%, transparent 90%, rgba(255, 255, 255, 0.016));
}

.character-bubble {
  position: absolute;
  top: 58px;
  right: 16px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 120px;
  padding: 5px 8px 5px 7px;
  font-family: 'PingFang SC', 'Helvetica Neue', sans-serif;
  font-size: 10px;
  line-height: 1.28;
  color: #edf7ff;
  letter-spacing: 0.01em;
  background: linear-gradient(180deg, rgba(12, 22, 42, 0.54), rgba(4, 9, 20, 0.46));
  border: 1px solid rgba(99, 231, 255, 0.12);
  border-radius: 999px;
  box-shadow:
    0 8px 18px rgba(0, 0, 0, 0.18),
    0 0 8px rgba(99, 231, 255, 0.035);
  backdrop-filter: blur(16px);
}

.character-bubble::before {
  content: '';
  position: absolute;
  left: 12px;
  bottom: -10px;
  width: 24px;
  height: 14px;
  border-radius: 0 0 12px 12px;
  background: radial-gradient(circle at 50% 0%, rgba(99, 231, 255, 0.16), transparent 74%);
  opacity: 0.62;
  filter: blur(0.8px);
}

.bubble-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--xr-cyan);
  box-shadow: 0 0 8px var(--xr-cyan);
  flex-shrink: 0;
  animation: blink 1.4s ease-in-out infinite;
}

.bubble-text {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bubble-thinking {
  border-color: rgba(169, 140, 255, 0.16);
  box-shadow:
    0 8px 18px rgba(0, 0, 0, 0.18),
    0 0 10px rgba(169, 140, 255, 0.05);

  .bubble-dot {
    background: #c4b5fd;
    box-shadow: 0 0 10px rgba(169, 140, 255, 0.78);
    animation-duration: 0.9s;
  }
}

.bubble-error {
  border-color: rgba(255, 211, 122, 0.18);
  box-shadow:
    0 8px 18px rgba(0, 0, 0, 0.18),
    0 0 10px rgba(255, 211, 122, 0.05);

  .bubble-dot {
    background: #fde68a;
    box-shadow: 0 0 10px rgba(255, 211, 122, 0.78);
  }
}

.bubble-offline {
  opacity: 0.7;
  border-color: rgba(255, 255, 255, 0.12);

  .bubble-dot {
    background: #7f90aa;
    box-shadow: none;
    animation: none;
  }
}

.bubble-fade-enter-active,
.bubble-fade-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.bubble-fade-enter-from,
.bubble-fade-leave-to {
  opacity: 0;
  transform: translateX(-4px) translateY(-2px);
}

.is-collapsed .character-bubble {
  display: none;
}

.floor-light {
  position: absolute;
  bottom: 22px;
  z-index: 3;
  width: 184px;
  height: 36px;
  border-radius: 50%;
  background:
    radial-gradient(ellipse, rgba(99, 231, 255, 0.24), rgba(77, 141, 255, 0.1) 36%, rgba(169, 140, 255, 0.06) 62%, transparent 78%);
  filter: blur(4px);
  animation: pulse 3.8s ease-in-out infinite;
}

.floor-reflection {
  position: absolute;
  bottom: 14px;
  width: 138px;
  height: 18px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(226, 246, 255, 0.08), rgba(226, 246, 255, 0.01) 58%, transparent 80%);
  opacity: 0.34;
  filter: blur(4px);
  z-index: 2;
}

.is-collapsed .floor-light {
  width: 44px;
  bottom: calc(50% - 46px);
  height: 10px;
}

.is-collapsed .floor-reflection {
  width: 30px;
  height: 8px;
  bottom: calc(50% - 50px);
}

.collapsed-pulse {
  display: grid;
  place-items: center;
  padding: 8px 0;
  border-top: 1px solid rgba(99, 231, 255, 0.12);

  .pulse-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--xr-cyan);
    box-shadow: 0 0 12px var(--xr-cyan);
    animation: blink 1.6s ease-in-out infinite;
  }
}

.thinking {
  .ring-outer { animation-duration: 8s; border-top-color: rgba(169, 140, 255, 0.88); }
  .ring-inner { animation-duration: 7s; }
  .character-stage { animation: breathe 1.7s ease-in-out infinite; }
  .mini-telemetry { opacity: 0.36; }
  .floor-light { animation-duration: 1.55s; }
  .collapsed-pulse .pulse-dot { animation-duration: 0.7s; }
}

.loading {
  .ring-outer { animation-duration: 12s; }
  .character-stage { animation: breathe 2.4s ease-in-out infinite; }
  .floor-light { animation-duration: 2.2s; }
}

.error {
  .ring-outer { border-top-color: rgba(255, 211, 122, 0.74); }

  .collapsed-pulse .pulse-dot {
    background: var(--xr-warning);
    box-shadow: 0 0 12px var(--xr-warning);
  }
}

.offline {
  filter: saturate(0.55) brightness(0.72);

  .collapsed-pulse .pulse-dot {
    background: var(--xr-danger);
    box-shadow: 0 0 12px var(--xr-danger);
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes breathe {
  50% { transform: translateY(-4px) scale(1.012); }
}

@keyframes pulse {
  50% { opacity: 0.52; transform: scaleX(0.88); }
}

@keyframes blink {
  50% { opacity: 0.42; transform: scale(0.72); }
}

@media (max-width: 1180px) {
  .xiaojiu-presence-dock {
    width: 118px;
    padding: 12px 8px;
  }

  .xiaojiu-presence-dock.is-collapsed { width: 52px; padding: 40px 4px 10px; }

  .presence-head,
  .presence-footer {
    display: none;
  }

  .mini-telemetry,
  .side-energy {
    display: none;
  }

  .presence-capsule {
    min-height: 100%;
  }

  .ring-outer { width: 155px; height: 155px; }
  .ring-inner { width: 96px; height: 96px; }

  .capsule-shell {
    width: 98px;
    height: 184px;
  }

  .capsule-sheen {
    width: 92px;
    height: 168px;
  }

  .character-stage {
    width: 92px;
    height: 164px;
  }

  .character-frame {
    width: 84px;
    height: 146px;
    padding: 4px;
    border-radius: 18px;
  }

  .character-frame::before,
  .character-frame::after,
  .frame-notch,
  .frame-spine,
  .frame-vignette {
    display: none;
  }

  .character-frame-inner {
    border-radius: 14px;
  }

  .character-video {
    object-position: center 9%;
  }

  .vertical-scan {
    width: 90px;
    height: 190px;
  }

  .floor-light {
    width: 96px;
    bottom: calc(50% - 96px);
  }

  .floor-reflection {
    width: 54px;
    bottom: calc(50% - 104px);
  }
}
</style>
