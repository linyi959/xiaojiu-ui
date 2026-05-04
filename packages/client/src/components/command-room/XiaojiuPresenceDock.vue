<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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

watch(collapsed, v => {
  try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0') } catch { /* ignore */ }
})

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
    if (activeTool.value?.toolName) return `调用 ${activeTool.value.toolName}`
    return '正在思考'
  }
  if (presenceState.value === 'loading') return '同步会话'
  if (presenceState.value === 'offline') return '链路离线'
  if (presenceState.value === 'error') return '刚才出错了'
  return route.name === 'hermes.chat' ? '等你说话' : '安静在线'
})

const moodCopy = computed(() => {
  if (presenceState.value === 'thinking') return activeTool.value ? 'TOOL RUNNING' : 'STREAMING'
  if (presenceState.value === 'loading') return 'SYNCING'
  if (presenceState.value === 'offline') return 'OFFLINE'
  if (presenceState.value === 'error') return 'CHECK NEEDED'
  return route.name === 'hermes.chat' ? 'LISTENING' : 'STANDBY'
})

const linkCopy = computed(() => (appStore.connected ? 'CONNECTED' : 'OFFLINE'))

// 情绪 → 素材映射，吃满 openroom 下的资源（happy/shy/angry/default）
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

const sessionTitle = computed(() => chatStore.activeSession?.title || '新的对话')
const messageCount = computed(() => chatStore.messages.length)
const activityCopy = computed(() => {
  if (activeTool.value?.toolName) return activeTool.value.toolName
  if (chatStore.isStreaming) return '模型回复中'
  if (chatStore.isLoadingMessages) return '读取历史'
  if (lastSystemError.value) return '需要检查'
  return '待命中'
})

// 角色气泡：根据状态给一句人话，不是 UI 报告
const bubbleCopy = computed(() => {
  if (presenceState.value === 'thinking') {
    if (activeTool.value?.toolName) return `让我查一下 ${activeTool.value.toolName}…`
    return '让我想想…'
  }
  if (presenceState.value === 'loading') return '同步一下会话哈'
  if (presenceState.value === 'offline') return '链路断了，我先离线'
  if (presenceState.value === 'error') return '刚才那步出错了，看一眼'
  if (route.name === 'hermes.chat') return '我在，说吧'
  return ''
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
      <div>
        <p>XIAOJIU PRESENCE</p>
        <strong>{{ stateCopy }}</strong>
        <small>{{ moodCopy }}</small>
      </div>
      <span class="presence-status" aria-label="连接状态">
        <i />
        {{ linkCopy }}
      </span>
    </header>

    <section class="presence-capsule" aria-label="小九透明生命舱">
      <div class="capsule-backlight" />
      <div class="scan-ring ring-outer" />
      <div class="scan-ring ring-mid" />
      <div class="scan-ring ring-inner" />
      <div class="vertical-scan" />

      <div class="mini-telemetry telemetry-left">
        <span />
        <span />
        <span />
      </div>
      <div class="mini-telemetry telemetry-right">
        <span />
        <span />
        <span />
      </div>

      <figure class="character-stage">
        <video
          class="character-video"
          :src="characterVideo"
          autoplay
          muted
          loop
          playsinline
          poster="/xiaojiu-presence/openroom/base.png"
        />
        <img class="character-fallback" src="/xiaojiu-presence/openroom/base.png" alt="小九虚拟人物" />
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
    </section>

    <footer v-if="!collapsed" class="status-strip" aria-label="小九状态仪表">
      <div class="strip-row">
        <span>会话</span>
        <strong :title="sessionTitle">{{ sessionTitle }}</strong>
      </div>
      <div class="strip-row">
        <span>活动</span>
        <strong :title="activityCopy">{{ activityCopy }}</strong>
      </div>
      <div class="strip-row">
        <span>消息</span>
        <strong>{{ messageCount }} 条</strong>
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
  opacity: 0.56;
  filter: drop-shadow(0 0 8px rgba(99, 231, 255, 0.5));
}

.side-energy-left { left: 13px; }
.side-energy-right { right: 13px; }

.is-collapsed .side-energy { display: none; }

.presence-head,
.presence-capsule,
.status-strip,
.collapsed-pulse {
  position: relative;
  z-index: 1;
}

.presence-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-height: 62px;
  padding-bottom: 10px;
  padding-left: 32px;

  p {
    margin: 0 0 6px;
    color: var(--xr-cyan);
    font-family: 'Fira Code', monospace;
    font-size: 9px;
    letter-spacing: 0.2em;
  }

  strong {
    display: block;
    max-width: 140px;
    font-size: 18px;
    line-height: 1.1;
    letter-spacing: -0.04em;
  }

  small {
    display: block;
    margin-top: 5px;
    color: var(--xr-muted);
    font-family: 'Fira Code', monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
  }
}

.presence-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid rgba(99, 231, 255, 0.14);
  border-radius: 999px;
  color: #cbd5e1;
  background: rgba(3, 8, 20, 0.3);
  font-family: 'Fira Code', monospace;
  font-size: 9px;
  white-space: nowrap;

  i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--xr-cyan);
    box-shadow: 0 0 14px rgba(99, 231, 255, 0.88);
  }
}

.presence-capsule {
  min-height: 430px;
  display: grid;
  place-items: center;
  overflow: hidden;
  isolation: isolate;
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

.scan-ring {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  transform-style: preserve-3d;
}

.ring-outer {
  width: 226px;
  height: 226px;
  border: 1px solid rgba(99, 231, 255, 0.24);
  border-top-color: rgba(99, 231, 255, 0.86);
  border-right-color: rgba(169, 140, 255, 0.38);
  animation: spin 22s linear infinite;
}

.ring-mid {
  width: 176px;
  height: 176px;
  border: 1px dashed rgba(77, 141, 255, 0.38);
  animation: spin 16s linear reverse infinite;
}

.ring-inner {
  width: 118px;
  height: 118px;
  border: 1px solid rgba(169, 140, 255, 0.26);
  border-left-color: rgba(99, 231, 255, 0.62);
  animation: spin 12s linear infinite;
}

.is-collapsed {
  .ring-outer { width: 48px; height: 48px; }
  .ring-mid { width: 38px; height: 38px; }
  .ring-inner { width: 28px; height: 28px; }
  .capsule-backlight { width: 64px; height: 110px; }
  .vertical-scan { width: 42px; height: 140px; }
  .mini-telemetry { display: none; }
}

.vertical-scan {
  position: absolute;
  width: 184px;
  height: 360px;
  border-radius: 999px;
  border-left: 1px solid rgba(99, 231, 255, 0.18);
  border-right: 1px solid rgba(169, 140, 255, 0.15);
  opacity: 0.62;
}

.mini-telemetry {
  position: absolute;
  top: 112px;
  z-index: 5;
  display: grid;
  gap: 9px;
  opacity: 0.38;

  span {
    display: block;
    width: 26px;
    height: 2px;
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, var(--xr-cyan));
    box-shadow: 0 0 10px rgba(99, 231, 255, 0.36);
  }
}

.telemetry-left {
  left: 12px;

  span:nth-child(2) { width: 38px; }
  span:nth-child(3) { width: 18px; }
}

.telemetry-right {
  right: 12px;
  transform: scaleX(-1);

  span:nth-child(1) { width: 18px; }
  span:nth-child(2) { width: 34px; }
}

.character-stage {
  position: relative;
  z-index: 4;
  width: 232px;
  height: 372px;
  margin: 0;
  overflow: hidden;
  background: transparent;
  border: 0;
  border-radius: 0;
  filter: drop-shadow(0 24px 46px rgba(0, 0, 0, 0.44));
  transition: width 0.26s ease, height 0.26s ease;
}

.is-collapsed .character-stage {
  width: 40px;
  height: 64px;
  filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.38));
}

.character-video,
.character-fallback {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}

.character-video {
  z-index: 2;
  filter: saturate(1.08) contrast(1.04);
  object-position: center 8%;
}

.character-fallback {
  z-index: 1;
}

.character-stage::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  background:
    radial-gradient(circle at 50% 16%, rgba(99, 231, 255, 0.06), transparent 34%),
    linear-gradient(180deg, transparent 58%, rgba(3, 7, 18, 0.72) 100%);
}

.character-bubble {
  position: absolute;
  top: 18px;
  right: -8px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 180px;
  padding: 6px 10px 6px 9px;
  font-family: 'PingFang SC', 'Helvetica Neue', sans-serif;
  font-size: 11px;
  line-height: 1.45;
  color: #edf7ff;
  letter-spacing: 0.02em;
  background: linear-gradient(180deg, rgba(12, 22, 42, 0.92), rgba(4, 9, 20, 0.86));
  border: 1px solid rgba(99, 231, 255, 0.32);
  border-radius: 10px 10px 10px 2px;
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.42),
    0 0 14px rgba(99, 231, 255, 0.18);
  backdrop-filter: blur(6px);
}

.character-bubble::before {
  content: '';
  position: absolute;
  left: -6px;
  bottom: 4px;
  width: 8px;
  height: 8px;
  background: linear-gradient(135deg, rgba(12, 22, 42, 0.92), rgba(4, 9, 20, 0.86));
  border-left: 1px solid rgba(99, 231, 255, 0.32);
  border-bottom: 1px solid rgba(99, 231, 255, 0.32);
  transform: rotate(45deg);
  border-radius: 2px;
}

.bubble-dot {
  width: 6px;
  height: 6px;
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
  border-color: rgba(169, 140, 255, 0.42);
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.42),
    0 0 16px rgba(169, 140, 255, 0.22);

  .bubble-dot {
    background: #c4b5fd;
    box-shadow: 0 0 10px rgba(169, 140, 255, 0.85);
    animation-duration: 0.9s;
  }
}

.bubble-error {
  border-color: rgba(255, 211, 122, 0.5);
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.42),
    0 0 18px rgba(255, 211, 122, 0.28);

  .bubble-dot {
    background: #fde68a;
    box-shadow: 0 0 10px rgba(255, 211, 122, 0.85);
  }
}

.bubble-offline {
  opacity: 0.7;
  border-color: rgba(255, 255, 255, 0.16);

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
  bottom: 38px;
  z-index: 3;
  width: 196px;
  height: 30px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(99, 231, 255, 0.34), rgba(77, 141, 255, 0.12) 42%, transparent 70%);
  filter: blur(1px);
  animation: pulse 3.8s ease-in-out infinite;
}

.is-collapsed .floor-light {
  width: 44px;
  bottom: calc(50% - 46px);
  height: 10px;
}

.status-strip {
  display: grid;
  gap: 7px;
  padding-top: 10px;
  border-top: 1px solid rgba(99, 231, 255, 0.1);
}

.strip-row {
  display: grid;
  grid-template-columns: 38px 1fr;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-family: 'Fira Code', 'PingFang SC', monospace;

  span {
    color: rgba(99, 231, 255, 0.68);
    font-size: 10px;
    letter-spacing: 0.1em;
  }

  strong {
    min-width: 0;
    color: var(--xr-soft);
    font-size: 10.5px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: right;
  }
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
  .ring-outer { animation-duration: 8s; border-top-color: rgba(169, 140, 255, 0.92); }
  .ring-mid { animation-duration: 6s; }
  .ring-inner { animation-duration: 5s; }
  .character-stage { animation: breathe 1.7s ease-in-out infinite; }
  .mini-telemetry { opacity: 0.76; }
  .floor-light { animation-duration: 1.55s; }
  .presence-status i { animation: blink 1.2s ease-in-out infinite; }
  .collapsed-pulse .pulse-dot { animation-duration: 0.7s; }
}

.loading {
  .ring-outer { animation-duration: 12s; }
  .ring-mid { animation-duration: 9s; }
  .character-stage { animation: breathe 2.4s ease-in-out infinite; }
  .floor-light { animation-duration: 2.2s; }
}

.error {
  .presence-status {
    color: #fde68a;
    border-color: rgba(255, 211, 122, 0.32);

    i {
      background: var(--xr-warning);
      box-shadow: 0 0 13px rgba(255, 211, 122, 0.78);
    }
  }

  .ring-outer { border-top-color: rgba(255, 211, 122, 0.78); }

  .collapsed-pulse .pulse-dot {
    background: var(--xr-warning);
    box-shadow: 0 0 12px var(--xr-warning);
  }
}

.offline {
  filter: saturate(0.55) brightness(0.72);

  .presence-status {
    color: #fecaca;
    border-color: rgba(251, 113, 133, 0.28);

    i {
      background: var(--xr-danger);
      box-shadow: 0 0 12px rgba(251, 113, 133, 0.72);
    }
  }

  .scan-ring,
  .mini-telemetry,
  .floor-light { opacity: 0.18; }

  .collapsed-pulse .pulse-dot {
    background: var(--xr-danger);
    box-shadow: 0 0 12px var(--xr-danger);
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes breathe {
  50% { transform: translateY(-5px) scale(1.018); }
}

@keyframes pulse {
  50% { opacity: 0.55; transform: scaleX(0.86); }
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
  .status-strip {
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
  .ring-mid { width: 112px; height: 112px; }
  .ring-inner { width: 76px; height: 76px; }

  .character-stage {
    width: 92px;
    height: 170px;
  }

  .vertical-scan {
    width: 90px;
    height: 190px;
  }

  .floor-light {
    width: 96px;
    bottom: calc(50% - 96px);
  }
}
</style>
