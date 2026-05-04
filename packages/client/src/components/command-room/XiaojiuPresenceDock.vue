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
    if (activeTool.value?.toolName) return activeTool.value.toolName
    return '在想你这句'
  }
  if (presenceState.value === 'loading') return '刚连上这边'
  if (presenceState.value === 'offline') return '暂时断开'
  if (presenceState.value === 'error') return '刚才卡了一下'
  return route.name === 'hermes.chat' ? '我在听' : '安静待命'
})

const moodCopy = computed(() => {
  if (presenceState.value === 'thinking') return activeTool.value ? 'ACTING' : 'THINKING'
  if (presenceState.value === 'loading') return 'SYNCING'
  if (presenceState.value === 'offline') return 'OFFLINE'
  if (presenceState.value === 'error') return 'RECOVERING'
  return route.name === 'hermes.chat' ? 'LISTENING' : 'STANDBY'
})

const linkCopy = computed(() => (appStore.connected ? 'ONLINE' : 'OFFLINE'))

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
const activityCopy = computed(() => {
  if (activeTool.value?.toolName) return activeTool.value.toolName
  if (chatStore.isStreaming) return '正在回你'
  if (chatStore.isLoadingMessages) return '翻一下刚才'
  if (lastSystemError.value) return '收一下刚才那步'
  return '在这儿陪着'
})

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
      <div class="head-shell-plate">
        <div class="presence-eyebrow-row">
          <p>XIAOJIU PRESENCE</p>
          <span class="presence-divider" />
          <small>{{ moodCopy }}</small>
        </div>
        <div class="presence-headline-row">
          <div class="presence-headline">
            <strong>{{ stateCopy }}</strong>
            <span class="presence-subtext">只为你亮着</span>
          </div>
          <span class="presence-status" aria-label="连接状态">
            <i />
            {{ linkCopy }}
          </span>
        </div>
      </div>
      <div class="head-flowline" aria-hidden="true">
        <span class="flowline-node" />
        <span class="flowline-track" />
        <span class="flowline-signal">PRESENCE LIVE</span>
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

    <footer v-if="!collapsed" class="status-strip" aria-label="小九状态基座">
      <div class="status-base-shell">
        <span class="base-rail base-rail-left" />
        <div class="base-core">
          <div class="base-readout">
            <span>SESSION</span>
            <strong :title="sessionTitle">{{ sessionTitle }}</strong>
          </div>
          <div class="base-divider" />
          <div class="base-readout">
            <span>ACTIVITY</span>
            <strong :title="activityCopy">{{ activityCopy }}</strong>
          </div>
        </div>
        <span class="base-rail base-rail-right" />
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
.status-strip,
.collapsed-pulse {
  position: relative;
  z-index: 1;
}

.presence-head {
  display: grid;
  gap: 8px;
  min-height: 72px;
  padding: 2px 0 0 32px;
}

.head-shell-plate {
  position: relative;
  display: grid;
  gap: 7px;
  padding: 8px 10px 10px 0;
}

.head-shell-plate::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 34px;
  height: 1px;
  background: linear-gradient(90deg, rgba(99, 231, 255, 0.34), rgba(99, 231, 255, 0.02));
}

.head-shell-plate::after {
  content: '';
  position: absolute;
  top: 0;
  right: 24px;
  width: 10px;
  height: 10px;
  border-top: 1px solid rgba(99, 231, 255, 0.2);
  border-right: 1px solid rgba(99, 231, 255, 0.16);
  border-top-right-radius: 10px;
  opacity: 0.9;
}

.presence-kicker {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.presence-headline-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.head-flowline {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-left: 3px;
  color: rgba(185, 201, 222, 0.46);
  font-family: 'Fira Code', monospace;
  font-size: 7px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.flowline-node {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: rgba(99, 231, 255, 0.82);
  box-shadow: 0 0 8px rgba(99, 231, 255, 0.34);
  flex-shrink: 0;
}

.flowline-track {
  width: 44px;
  height: 1px;
  background: linear-gradient(90deg, rgba(99, 231, 255, 0.3), rgba(99, 231, 255, 0.04));
}

.flowline-signal {
  white-space: nowrap;
}

.presence-eyebrow-row {
  display: flex;
  align-items: center;
  gap: 7px;

  p,
  small {
    margin: 0;
    font-family: 'Fira Code', monospace;
    font-size: 8px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  p {
    color: rgba(99, 231, 255, 0.82);
  }

  small {
    color: rgba(185, 201, 222, 0.38);
  }
}

.presence-divider {
  width: 14px;
  height: 1px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(99, 231, 255, 0.32), rgba(99, 231, 255, 0));
}

.presence-headline {
  display: grid;
  gap: 2px;
  min-width: 0;

  strong {
    display: block;
    max-width: 136px;
    font-size: 16px;
    line-height: 1.05;
    letter-spacing: -0.03em;
    text-shadow: 0 0 10px rgba(99, 231, 255, 0.06);
  }
}

.presence-subtext {
  color: rgba(185, 201, 222, 0.42);
  font-size: 9px;
  letter-spacing: 0.06em;
}

.presence-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 1px;
  padding: 4px 0 4px 8px;
  border-left: 1px solid rgba(99, 231, 255, 0.14);
  border-radius: 0;
  color: rgba(203, 213, 225, 0.72);
  background: transparent;
  box-shadow: none;
  font-family: 'Fira Code', monospace;
  font-size: 7px;
  letter-spacing: 0.16em;
  white-space: nowrap;

  i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--xr-cyan);
    box-shadow: 0 0 12px rgba(99, 231, 255, 0.72);
  }
}

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

.status-strip {
  position: relative;
  padding-top: 8px;
}

.status-base-shell {
  position: relative;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) 22px;
  align-items: center;
  gap: 8px;
  padding: 10px 0 2px;
}

.base-rail {
  position: relative;
  display: block;
  height: 1px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(99, 231, 255, 0.02), rgba(99, 231, 255, 0.22), rgba(99, 231, 255, 0.02));
}

.base-core {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px 9px;
  border-top: 1px solid rgba(99, 231, 255, 0.14);
  border-bottom: 1px solid rgba(99, 231, 255, 0.06);
  border-radius: 16px 16px 20px 20px;
  background: linear-gradient(180deg, rgba(10, 18, 34, 0.18), rgba(5, 10, 21, 0.42));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    inset 0 -10px 20px rgba(3, 7, 18, 0.14);
}

.base-core::before {
  content: '';
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: -8px;
  height: 14px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(99, 231, 255, 0.1), rgba(77, 141, 255, 0.03) 48%, transparent 78%);
  filter: blur(8px);
  opacity: 0.76;
}

.base-readout {
  display: grid;
  gap: 3px;
  min-width: 0;
  font-family: 'Fira Code', 'PingFang SC', monospace;

  span {
    color: rgba(99, 231, 255, 0.42);
    font-size: 7px;
    letter-spacing: 0.18em;
  }

  strong {
    min-width: 0;
    color: rgba(237, 247, 255, 0.78);
    font-size: 9px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.base-divider {
  width: 1px;
  height: 24px;
  background: linear-gradient(180deg, rgba(99, 231, 255, 0.02), rgba(99, 231, 255, 0.2), rgba(99, 231, 255, 0.04));
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
  .presence-status i { animation: blink 1.2s ease-in-out infinite; }
  .collapsed-pulse .pulse-dot { animation-duration: 0.7s; }
}

.loading {
  .ring-outer { animation-duration: 12s; }
  .character-stage { animation: breathe 2.4s ease-in-out infinite; }
  .floor-light { animation-duration: 2.2s; }
}

.error {
  .presence-status {
    color: #fde68a;
    border-color: rgba(255, 211, 122, 0.24);

    i {
      background: var(--xr-warning);
      box-shadow: 0 0 13px rgba(255, 211, 122, 0.74);
    }
  }

  .ring-outer { border-top-color: rgba(255, 211, 122, 0.74); }

  .collapsed-pulse .pulse-dot {
    background: var(--xr-warning);
    box-shadow: 0 0 12px var(--xr-warning);
  }
}

.offline {
  filter: saturate(0.55) brightness(0.72);

  .presence-status {
    color: #fecaca;
    border-color: rgba(251, 113, 133, 0.2);

    i {
      background: var(--xr-danger);
      box-shadow: 0 0 12px rgba(251, 113, 133, 0.68);
    }
  }

  .scan-ring,
  .mini-telemetry,
  .floor-light,
  .floor-reflection,
  .character-seat-glow { opacity: 0.18; }

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
