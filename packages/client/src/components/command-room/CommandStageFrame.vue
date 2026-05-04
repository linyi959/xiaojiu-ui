<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/hermes/app'
import { useChatStore } from '@/stores/hermes/chat'
import { useCommandPalette } from '@/composables/useCommandPalette'

const route = useRoute()
const appStore = useAppStore()
const chatStore = useChatStore()
const { open: openPalette } = useCommandPalette()

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
const cmdKey = isMac ? '⌘' : 'Ctrl'

const { connected } = storeToRefs(appStore)
const { activeSession, isStreaming } = storeToRefs(chatStore)

// 路由名 -> 模块元数据（group / title / subtitle），严格对齐契约五大模块
const moduleMap: Record<string, { group: string; title: string; subtitle: string; code: string }> = {
  'hermes.chat':      { group: '对话中枢', title: '对话核心',    subtitle: '小九与林燚的主通道',       code: 'CHAT-01' },
  'hermes.history':   { group: '对话中枢', title: '会话历史',    subtitle: '所有曾经发生过的谈话',     code: 'CHAT-02' },
  'hermes.groupChat': { group: '对话中枢', title: '群组协作',    subtitle: '多 Agent 协同对话',        code: 'CHAT-03' },
  'hermes.monitor':   { group: '任务指挥', title: '任务雷达',    subtitle: '实时运行概览',             code: 'MIS-01' },
  'hermes.jobs':      { group: '任务指挥', title: '自动任务',    subtitle: '调度 / Cron / Webhook',    code: 'MIS-02' },
  'hermes.usage':     { group: '任务指挥', title: '用量统计',    subtitle: 'Token · 次数 · 趋势',      code: 'MIS-03' },
  'hermes.logs':      { group: '任务指挥', title: '运行日志',    subtitle: '系统与任务流水',           code: 'MIS-04' },
  'hermes.memory':    { group: '记忆与知识', title: '记忆系统',  subtitle: '长期 · 短期 · 情绪档案',    code: 'MEM-01' },
  'hermes.files':     { group: '记忆与知识', title: '文件舱',    subtitle: '文件存取与上传',           code: 'MEM-02' },
  'hermes.skills':    { group: '能力兵器库', title: '技能库',    subtitle: '已安装 / 可调用能力',      code: 'ARS-01' },
  'hermes.models':    { group: '能力兵器库', title: '模型核心',  subtitle: '大脑池 · Provider 配置',   code: 'ARS-02' },
  'hermes.terminal':  { group: '能力兵器库', title: '执行终端',  subtitle: '直接向机器发指令',         code: 'ARS-03' },
  'hermes.gateways':  { group: '能力兵器库', title: '网关',      subtitle: '对外连通与授权',           code: 'ARS-04' },
  'hermes.channels':  { group: '能力兵器库', title: '频道',      subtitle: 'Telegram · Discord · etc', code: 'ARS-05' },
  'hermes.profiles':  { group: '系统驾驶舱', title: '档案',      subtitle: '身份 / 配置切换',          code: 'SYS-01' },
  'hermes.settings':  { group: '系统驾驶舱', title: '设置',      subtitle: '界面 · 凭证 · 隐私',        code: 'SYS-02' },
}

const meta = computed(() => {
  const name = String(route.name || '')
  return moduleMap[name] || { group: '小九中枢', title: '命令核心', subtitle: '—', code: 'CORE' }
})

const connectionLabel = computed(() => (connected.value ? 'ONLINE' : 'OFFLINE'))
const streamLabel = computed(() => (isStreaming.value ? 'STREAMING' : 'IDLE'))
const sessionLabel = computed(() => {
  const s = activeSession.value
  if (!s) return '—'
  const n = s.messageCount ?? s.messages?.length ?? 0
  return `${String(s.id).slice(0, 8)} · ${n} msg`
})
const modelLabel = computed(() => appStore.selectedModel || '—')
</script>

<template>
  <section class="command-stage-frame" :class="{ 'is-streaming': isStreaming, 'is-offline': !connected }">
    <header class="stage-topbar">
      <div class="topbar-left">
        <div class="crumb">
          <span class="crumb-group">{{ meta.group }}</span>
          <span class="crumb-divider">/</span>
          <span class="crumb-code">{{ meta.code }}</span>
        </div>
        <h1 class="stage-title">{{ meta.title }}</h1>
        <p class="stage-subtitle">{{ meta.subtitle }}</p>
      </div>

      <div class="topbar-right">
        <div class="telemetry">
          <div class="telemetry-item" :class="{ ok: connected, off: !connected }">
            <span class="dot" />
            <div class="tcol">
              <span class="tlabel">连接</span>
              <strong class="tvalue">{{ connectionLabel }}</strong>
            </div>
          </div>

          <div class="telemetry-item" :class="{ streaming: isStreaming }">
            <span class="dot" />
            <div class="tcol">
              <span class="tlabel">链路</span>
              <strong class="tvalue">{{ streamLabel }}</strong>
            </div>
          </div>

          <div class="telemetry-item">
            <div class="tcol">
              <span class="tlabel">会话</span>
              <strong class="tvalue">{{ sessionLabel }}</strong>
            </div>
          </div>

          <div class="telemetry-item">
            <div class="tcol">
              <span class="tlabel">大脑</span>
              <strong class="tvalue">{{ modelLabel }}</strong>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="cmdk-trigger"
          :title="`唤出指令面板（${cmdKey}K）`"
          @click="openPalette()"
        >
          <span class="cmdk-icon">/</span>
          <span class="cmdk-text">指令</span>
          <span class="cmdk-shortcut"><kbd>{{ cmdKey }}</kbd><kbd>K</kbd></span>
        </button>
      </div>
    </header>

    <div class="stage-surface command-room-adapter" :class="{ 'is-chat-stage': route.name === 'hermes.chat' }">
      <slot />
    </div>
  </section>
</template>

<style scoped lang="scss">
.command-stage-frame {
  position: relative;
  flex: 1;
  min-width: 0;
  height: calc(100 * var(--vh));
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 0%, rgba(99, 231, 255, 0.08), transparent 28%),
    radial-gradient(circle at 84% 12%, rgba(169, 140, 255, 0.08), transparent 24%),
    linear-gradient(135deg, #02040b 0%, #07101f 52%, #02040b 100%);
}

.command-stage-frame::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.18;
  background-image:
    linear-gradient(rgba(99, 231, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99, 231, 255, 0.04) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(circle at center, black, transparent 84%);
}

.stage-topbar,
.stage-surface {
  position: relative;
  z-index: 1;
}

.stage-topbar {
  min-height: 82px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 14px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(2, 6, 23, 0.58);
  backdrop-filter: blur(18px);
}

.topbar-left {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  letter-spacing: 0.2em;
}

.crumb-group {
  color: #63e7ff;
}

.crumb-divider {
  color: rgba(99, 231, 255, 0.34);
}

.crumb-code {
  color: #7f90aa;
}

.stage-title {
  margin: 4px 0 0;
  color: #f8fafc;
  font-size: 22px;
  font-weight: 640;
  letter-spacing: -0.01em;
}

.stage-subtitle {
  margin: 0;
  color: #8ba0bd;
  font-size: 12.5px;
  letter-spacing: 0.02em;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cmdk-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px 8px 14px;
  background: linear-gradient(135deg, rgba(99, 231, 255, 0.08), rgba(77, 141, 255, 0.05));
  border: 1px solid rgba(99, 231, 255, 0.22);
  border-radius: 12px;
  color: #cbe5ff;
  font-size: 12px;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;

  &:hover {
    background: linear-gradient(135deg, rgba(99, 231, 255, 0.18), rgba(77, 141, 255, 0.12));
    border-color: rgba(99, 231, 255, 0.42);
    color: #edf7ff;
    box-shadow: 0 0 18px rgba(99, 231, 255, 0.22);
  }

  &:active {
    transform: translateY(1px);
  }

  .cmdk-icon {
    font-family: 'Fira Code', monospace;
    color: #63e7ff;
    font-weight: 600;
    font-size: 14px;
    text-shadow: 0 0 8px rgba(99, 231, 255, 0.5);
  }

  .cmdk-text {
    font-weight: 500;
  }

  .cmdk-shortcut {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding-left: 8px;
    border-left: 1px solid rgba(99, 231, 255, 0.16);

    kbd {
      font-family: 'Fira Code', monospace;
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      border: 1px solid rgba(99, 231, 255, 0.22);
      background: rgba(2, 6, 16, 0.5);
      color: #cbe5ff;
      line-height: 1.4;
    }
  }
}

.telemetry {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.telemetry-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 96px;
  padding: 8px 12px;
  border: 1px solid rgba(99, 231, 255, 0.14);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(12, 22, 42, 0.78), rgba(4, 9, 20, 0.58));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
}

.telemetry-item .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(127, 144, 170, 0.6);
  box-shadow: 0 0 0 0 transparent;
  transition: background 0.2s ease, box-shadow 0.2s ease;
}

.telemetry-item.ok .dot {
  background: #6ee7b7;
  box-shadow: 0 0 12px rgba(110, 231, 183, 0.8);
}

.telemetry-item.off .dot {
  background: #ff6b8a;
  box-shadow: 0 0 12px rgba(255, 107, 138, 0.7);
}

.telemetry-item.streaming .dot {
  background: #63e7ff;
  box-shadow: 0 0 14px rgba(99, 231, 255, 0.85);
  animation: dot-pulse 1.2s ease-in-out infinite;
}

/* streaming 状态下整条遥测条呼吸：边缘色 + 微辉光 */
.command-stage-frame.is-streaming .telemetry-item {
  border-color: rgba(99, 231, 255, 0.28);
  background:
    linear-gradient(180deg, rgba(18, 30, 56, 0.78), rgba(6, 14, 28, 0.58));
  animation: telemetry-breathe 3.6s ease-in-out infinite;
}

.command-stage-frame.is-streaming .stage-topbar {
  border-bottom-color: rgba(99, 231, 255, 0.28);
  background:
    linear-gradient(180deg, rgba(8, 16, 32, 0.7) 0%, rgba(2, 6, 23, 0.4) 100%);
  animation: topbar-glow 4.2s ease-in-out infinite;
}

.command-stage-frame.is-offline .stage-topbar {
  border-bottom-color: rgba(255, 107, 138, 0.22);
}

.command-stage-frame.is-offline .stage-title {
  color: #ffd3da;
}

@keyframes telemetry-breathe {
  0%, 100% {
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
  }
  50% {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 0 16px rgba(99, 231, 255, 0.18);
  }
}

@keyframes topbar-glow {
  0%, 100% {
    box-shadow: 0 0 0 0 transparent;
  }
  50% {
    box-shadow: inset 0 -1px 0 rgba(99, 231, 255, 0.18);
  }
}

@keyframes dot-pulse {
  0%, 100% { transform: scale(0.85); opacity: 0.7; }
  50% { transform: scale(1.15); opacity: 1; }
}

.tcol {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.tlabel {
  color: #7f90aa;
  font-family: 'Fira Code', monospace;
  font-size: 9px;
  letter-spacing: 0.16em;
}

.tvalue {
  color: #edf7ff;
  font-family: 'Fira Code', monospace;
  font-size: 11.5px;
  font-weight: 620;
  letter-spacing: 0.04em;
  white-space: nowrap;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stage-surface {
  height: calc(100% - 82px);
  padding: 18px;
  overflow: auto;
}

.stage-surface.is-chat-stage {
  overflow: hidden;
}

.command-room-adapter {
  --bg-primary: transparent;
  --bg-secondary: rgba(3, 8, 19, 0.68);
  --bg-sidebar: rgba(8, 15, 29, 0.78);
  --bg-card: rgba(12, 22, 42, 0.82);
  --bg-card-hover: rgba(18, 32, 58, 0.88);
  --bg-input: rgba(3, 8, 19, 0.72);
  --border-color: rgba(99, 231, 255, 0.16);
  --border-light: rgba(99, 231, 255, 0.1);
  --accent-primary: #63e7ff;
  --accent-hover: #4d8dff;
  --accent-muted: #7f90aa;
  --text-primary: #edf7ff;
  --text-secondary: #b9c9de;
  --text-muted: #7f90aa;
  --msg-user-bg: rgba(99, 231, 255, 0.1);
  --msg-assistant-bg: rgba(12, 22, 42, 0.78);
  --msg-system-border: rgba(99, 231, 255, 0.22);
  --code-bg: rgba(2, 6, 23, 0.72);
  --accent-primary-rgb: 99, 231, 255;
  --accent-hover-rgb: 77, 141, 255;
  --text-primary-rgb: 237, 247, 255;
  --text-muted-rgb: 127, 144, 170;
  color: #edf7ff;
}

.command-room-adapter :deep(.chat-view) {
  min-height: 0;
  height: 100%;
  color: #edf7ff;
  background:
    radial-gradient(circle at 50% 0%, rgba(99, 231, 255, 0.06), transparent 34%),
    linear-gradient(135deg, rgba(3, 7, 18, 0.72), rgba(8, 15, 29, 0.54)) !important;
  border: 1px solid rgba(99, 231, 255, 0.14);
  border-radius: 28px;
  overflow: hidden;
  box-shadow: 0 28px 88px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.command-room-adapter :deep(.chat-panel),
.command-room-adapter :deep(.chat-main),
.command-room-adapter :deep(.xiaojiu-conversation-card) {
  min-height: 0;
}

.command-room-adapter :deep(.history-view),
.command-room-adapter :deep(.jobs-view),
.command-room-adapter :deep(.monitor-view),
.command-room-adapter :deep(.models-view),
.command-room-adapter :deep(.profiles-view),
.command-room-adapter :deep(.logs-view),
.command-room-adapter :deep(.usage-view),
.command-room-adapter :deep(.skills-view),
.command-room-adapter :deep(.memory-view),
.command-room-adapter :deep(.settings-view),
.command-room-adapter :deep(.gateways-view),
.command-room-adapter :deep(.channels-view),
.command-room-adapter :deep(.terminal-view),
.command-room-adapter :deep(.group-chat-view),
.command-room-adapter :deep(.files-view) {
  min-height: 100%;
  height: auto;
  color: #edf7ff;
  background:
    radial-gradient(circle at 50% 0%, rgba(99, 231, 255, 0.06), transparent 34%),
    linear-gradient(135deg, rgba(3, 7, 18, 0.72), rgba(8, 15, 29, 0.54)) !important;
  border: 1px solid rgba(99, 231, 255, 0.14);
  border-radius: 28px;
  overflow: hidden;
  box-shadow: 0 28px 88px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.command-room-adapter :deep(.page-header) {
  padding: 18px 22px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(90deg, rgba(99, 231, 255, 0.085), transparent 62%),
    rgba(2, 6, 23, 0.52);
}

.command-room-adapter :deep(.header-title),
.command-room-adapter :deep(h1),
.command-room-adapter :deep(h2),
.command-room-adapter :deep(h3) {
  color: #edf7ff !important;
}

.command-room-adapter :deep(.header-subtitle),
.command-room-adapter :deep(.subtitle),
.command-room-adapter :deep(.description),
.command-room-adapter :deep(.text-muted),
.command-room-adapter :deep(small) {
  color: #7f90aa !important;
}

.command-room-adapter :deep(.n-card),
.command-room-adapter :deep(.n-alert),
.command-room-adapter :deep(.n-collapse-item),
.command-room-adapter :deep(.n-tabs-pane-wrapper),
.command-room-adapter :deep(.n-data-table),
.command-room-adapter :deep(.n-list),
.command-room-adapter :deep(.n-thing),
.command-room-adapter :deep(.gateway-card),
.command-room-adapter :deep(.profile-card),
.command-room-adapter :deep(.job-card),
.command-room-adapter :deep(.skill-card),
.command-room-adapter :deep(.model-card),
.command-room-adapter :deep(.memory-card),
.command-room-adapter :deep(.usage-card),
.command-room-adapter :deep(.settings-section),
.command-room-adapter :deep(.log-entry),
.command-room-adapter :deep(.channel-card),
.command-room-adapter :deep(.file-card),
.command-room-adapter :deep(.session-card),
.command-room-adapter :deep(.panel),
.command-room-adapter :deep(.card) {
  color: #edf7ff !important;
  background:
    linear-gradient(180deg, rgba(12, 22, 42, 0.82), rgba(4, 9, 20, 0.62)) !important;
  border-color: rgba(99, 231, 255, 0.16) !important;
  box-shadow: 0 18px 54px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.035) !important;
}

.command-room-adapter :deep(.n-card-header),
.command-room-adapter :deep(.n-card__content),
.command-room-adapter :deep(.n-collapse-item__header),
.command-room-adapter :deep(.n-data-table-th),
.command-room-adapter :deep(.n-data-table-td),
.command-room-adapter :deep(.n-list-item) {
  color: #edf7ff !important;
  background: transparent !important;
  border-color: rgba(99, 231, 255, 0.1) !important;
}

.command-room-adapter :deep(.n-input),
.command-room-adapter :deep(.n-input-wrapper),
.command-room-adapter :deep(.n-base-selection),
.command-room-adapter :deep(.n-base-selection-label),
.command-room-adapter :deep(input),
.command-room-adapter :deep(textarea),
.command-room-adapter :deep(select) {
  color: #edf7ff !important;
  background: rgba(3, 8, 19, 0.66) !important;
  border-color: rgba(99, 231, 255, 0.18) !important;
}

.command-room-adapter :deep(.n-button),
.command-room-adapter :deep(button) {
  color: #b9c9de;
  border-color: rgba(99, 231, 255, 0.18) !important;
}

.command-room-adapter :deep(.n-button:hover),
.command-room-adapter :deep(button:hover) {
  color: #fff !important;
  border-color: rgba(99, 231, 255, 0.36) !important;
  background: rgba(99, 231, 255, 0.09) !important;
}

.command-room-adapter :deep(.n-button--primary-type),
.command-room-adapter :deep(.primary),
.command-room-adapter :deep(.active) {
  border-color: rgba(99, 231, 255, 0.42) !important;
  background: linear-gradient(90deg, rgba(99, 231, 255, 0.18), rgba(77, 141, 255, 0.08)) !important;
}

.command-room-adapter :deep(.n-data-table-table),
.command-room-adapter :deep(table) {
  color: #edf7ff !important;
  background: transparent !important;
}

.command-room-adapter :deep(a) {
  color: #63e7ff !important;
}

.command-room-adapter :deep(::placeholder) {
  color: rgba(185, 201, 222, 0.48) !important;
}

/* ========== 通用模块视觉强化（作用所有非 chat 视图） ========== */

/* 页头：所有 .page-header 统一成 command-core 风格 */
.command-room-adapter :deep(.page-header) {
  padding: 18px 22px 14px !important;
  border-bottom: 1px solid rgba(99, 231, 255, 0.12) !important;
  background:
    linear-gradient(180deg, rgba(8, 16, 32, 0.5), transparent) !important;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.command-room-adapter :deep(.page-header .header-title),
.command-room-adapter :deep(.page-header h1),
.command-room-adapter :deep(.page-header h2) {
  margin: 0 !important;
  color: #edf7ff !important;
  font-size: 17px !important;
  font-weight: 640 !important;
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: 10px;
}

.command-room-adapter :deep(.page-header .header-title::before),
.command-room-adapter :deep(.page-header h2::before) {
  content: '';
  width: 3px;
  height: 14px;
  background: linear-gradient(180deg, #63e7ff, #4d8dff);
  border-radius: 2px;
  box-shadow: 0 0 8px rgba(99, 231, 255, 0.6);
}

/* 通用 view 容器：让顶层视图与 stage 融为一体 */
.command-room-adapter :deep(.jobs-view),
.command-room-adapter :deep(.memory-view),
.command-room-adapter :deep(.skills-view),
.command-room-adapter :deep(.models-view),
.command-room-adapter :deep(.terminal-view),
.command-room-adapter :deep(.gateways-view),
.command-room-adapter :deep(.channels-view),
.command-room-adapter :deep(.profiles-view),
.command-room-adapter :deep(.settings-view),
.command-room-adapter :deep(.usage-view),
.command-room-adapter :deep(.logs-view),
.command-room-adapter :deep(.files-view),
.command-room-adapter :deep(.history-view),
.command-room-adapter :deep(.monitor-view),
.command-room-adapter :deep(.group-chat-view) {
  background: transparent !important;
}

/* monitor 上的 mission-card：升级成命令核心式仪表 */
.command-room-adapter :deep(.mission-card) {
  border: 1px solid rgba(99, 231, 255, 0.16) !important;
  border-radius: 14px !important;
  background: linear-gradient(180deg, rgba(12, 22, 42, 0.78), rgba(4, 9, 20, 0.52)) !important;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.03) !important;
}

.command-room-adapter :deep(.mission-card.primary),
.command-room-adapter :deep(.mission-card.is-active) {
  border-color: rgba(99, 231, 255, 0.42) !important;
  background: linear-gradient(135deg, rgba(99, 231, 255, 0.14), rgba(77, 141, 255, 0.06)) !important;
}

.command-room-adapter :deep(.metric-label) {
  color: #7f90aa !important;
  font-family: 'Fira Code', monospace !important;
  font-size: 10px !important;
  letter-spacing: 0.18em !important;
  text-transform: uppercase;
}

/* tabs：用 command-core 风格的 tab 头 */
.command-room-adapter :deep(.n-tabs-tab) {
  color: #7f90aa !important;
  font-weight: 540 !important;
  letter-spacing: 0.04em;
  transition: color 0.18s ease, border-color 0.18s ease !important;
}

.command-room-adapter :deep(.n-tabs-tab:hover) {
  color: #cbe5ff !important;
}

.command-room-adapter :deep(.n-tabs-tab.n-tabs-tab--active) {
  color: #63e7ff !important;
}

.command-room-adapter :deep(.n-tabs-bar) {
  background: linear-gradient(90deg, #63e7ff, #4d8dff) !important;
  height: 2px !important;
  border-radius: 2px;
  box-shadow: 0 0 10px rgba(99, 231, 255, 0.6);
}

.command-room-adapter :deep(.n-tabs-nav-y-scroll),
.command-room-adapter :deep(.n-tabs-rail),
.command-room-adapter :deep(.n-tabs-tab-pad),
.command-room-adapter :deep(.n-tabs-nav__prefix),
.command-room-adapter :deep(.n-tabs-nav__suffix) {
  background: transparent !important;
}

/* tag */
.command-room-adapter :deep(.n-tag) {
  background: rgba(99, 231, 255, 0.08) !important;
  color: #cbe5ff !important;
  border: 1px solid rgba(99, 231, 255, 0.22) !important;
  border-radius: 999px !important;
  font-family: 'Fira Code', monospace !important;
  font-size: 11px !important;
  letter-spacing: 0.04em;
}

.command-room-adapter :deep(.n-tag--success-type),
.command-room-adapter :deep(.n-tag.success) {
  background: rgba(110, 231, 183, 0.1) !important;
  color: #6ee7b7 !important;
  border-color: rgba(110, 231, 183, 0.3) !important;
}

.command-room-adapter :deep(.n-tag--error-type),
.command-room-adapter :deep(.n-tag--warning-type),
.command-room-adapter :deep(.n-tag.error) {
  background: rgba(255, 107, 138, 0.1) !important;
  color: #ff9aae !important;
  border-color: rgba(255, 107, 138, 0.3) !important;
}

/* modal：让弹窗和中枢同源 */
.command-room-adapter :deep(.n-modal),
.command-room-adapter :deep(.n-dialog),
.command-room-adapter :deep(.n-drawer),
.command-room-adapter :deep(.n-popover) {
  background: linear-gradient(180deg, rgba(8, 16, 32, 0.96), rgba(2, 6, 23, 0.92)) !important;
  border: 1px solid rgba(99, 231, 255, 0.2) !important;
  border-radius: 14px !important;
  color: #edf7ff !important;
  box-shadow:
    0 28px 80px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.045) !important;
}

.command-room-adapter :deep(.n-dialog .n-dialog__title),
.command-room-adapter :deep(.n-modal .n-card-header__main) {
  color: #edf7ff !important;
}

/* 滚动条：所有内部滚动区统一光纤蓝 */
.command-room-adapter :deep(*)::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.command-room-adapter :deep(*)::-webkit-scrollbar-thumb {
  background: rgba(99, 231, 255, 0.18);
  border-radius: 999px;
}
.command-room-adapter :deep(*)::-webkit-scrollbar-thumb:hover {
  background: rgba(99, 231, 255, 0.32);
}
.command-room-adapter :deep(*)::-webkit-scrollbar-track {
  background: transparent;
}

/* 分割线 */
.command-room-adapter :deep(.n-divider),
.command-room-adapter :deep(.splitter),
.command-room-adapter :deep(hr) {
  background: rgba(99, 231, 255, 0.12) !important;
  border-color: rgba(99, 231, 255, 0.12) !important;
}

/* spin loading 颜色统一 */
.command-room-adapter :deep(.n-spin .n-base-loading) {
  color: #63e7ff !important;
}

/* select 下拉 */
.command-room-adapter :deep(.n-base-select-menu),
.command-room-adapter :deep(.n-dropdown-menu) {
  background: rgba(8, 16, 32, 0.96) !important;
  border: 1px solid rgba(99, 231, 255, 0.18) !important;
  border-radius: 12px !important;
  color: #cbe5ff !important;
}

.command-room-adapter :deep(.n-base-select-option:hover),
.command-room-adapter :deep(.n-dropdown-option-body:hover) {
  background: rgba(99, 231, 255, 0.08) !important;
  color: #fff !important;
}

/* code/pre 在所有 view 内统一 */
.command-room-adapter :deep(pre),
.command-room-adapter :deep(code) {
  background: rgba(2, 6, 23, 0.7) !important;
  border: 1px solid rgba(99, 231, 255, 0.1) !important;
  border-radius: 8px !important;
  color: #cbe5ff !important;
  font-family: 'Fira Code', monospace !important;
}

/* terminal 视图特殊：保留终端黑底 + 命令核心绿 */
.command-room-adapter :deep(.terminal-view .xterm) {
  background: #02040b !important;
  border: 1px solid rgba(99, 231, 255, 0.18) !important;
  border-radius: 12px !important;
}

/* ========== Chat 页深度强化（作用范围：chat-view 内部） ========== */

/* 1. 左侧会话列表：收敛成 command-core 风格的会话候选栏 */
.command-room-adapter :deep(.chat-view .chat-panel) {
  gap: 0;
}

.command-room-adapter :deep(.chat-view .session-list) {
  background:
    linear-gradient(180deg, rgba(4, 9, 20, 0.72), rgba(3, 7, 18, 0.58)) !important;
  border-right: 1px solid rgba(99, 231, 255, 0.1) !important;
  backdrop-filter: blur(14px);
}

.command-room-adapter :deep(.chat-view .session-list-header) {
  padding: 14px 14px 10px !important;
  border-bottom: 1px solid rgba(99, 231, 255, 0.1) !important;
  background: rgba(2, 6, 23, 0.42) !important;
}

.command-room-adapter :deep(.chat-view .session-list-title) {
  color: #63e7ff !important;
  font-family: 'Fira Code', monospace !important;
  font-size: 10px !important;
  font-weight: 600 !important;
  letter-spacing: 0.22em !important;
  text-transform: uppercase;
}

.command-room-adapter :deep(.chat-view .session-group-header) {
  padding: 10px 14px 6px !important;
  color: rgba(127, 144, 170, 0.82) !important;
  font-family: 'Fira Code', monospace !important;
  font-size: 9.5px !important;
  letter-spacing: 0.16em !important;
  text-transform: uppercase;
}

.command-room-adapter :deep(.chat-view .session-group-count) {
  color: rgba(99, 231, 255, 0.72) !important;
}

.command-room-adapter :deep(.chat-view .session-item) {
  border-radius: 12px !important;
  margin: 3px 8px !important;
  border: 1px solid transparent !important;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease !important;
}

.command-room-adapter :deep(.chat-view .session-item:hover) {
  border-color: rgba(99, 231, 255, 0.22) !important;
  background: rgba(99, 231, 255, 0.06) !important;
  transform: translateX(2px);
}

.command-room-adapter :deep(.chat-view .session-item.active) {
  border-color: rgba(99, 231, 255, 0.48) !important;
  background: linear-gradient(
    135deg,
    rgba(99, 231, 255, 0.16),
    rgba(77, 141, 255, 0.06)
  ) !important;
  box-shadow:
    0 10px 26px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
}

/* 2. Chat header：去掉原版卡片感，融入到 stage */
.command-room-adapter :deep(.chat-view .chat-header) {
  padding: 12px 20px !important;
  background: rgba(2, 6, 23, 0.4) !important;
  border-bottom: 1px solid rgba(99, 231, 255, 0.1) !important;
}

.command-room-adapter :deep(.chat-view .header-session-title) {
  color: #edf7ff !important;
  font-size: 15px !important;
  font-weight: 640 !important;
  letter-spacing: -0.01em;
}

.command-room-adapter :deep(.chat-view .source-badge),
.command-room-adapter :deep(.chat-view .workspace-badge) {
  padding: 4px 9px !important;
  border: 1px solid rgba(99, 231, 255, 0.2) !important;
  border-radius: 999px !important;
  background: rgba(99, 231, 255, 0.07) !important;
  color: #8db7d9 !important;
  font-family: 'Fira Code', monospace !important;
  font-size: 10px !important;
  letter-spacing: 0.08em !important;
}

/* 3. 主要对话卡片容器：让 MessageList + ChatInput 成为一个"指令屏"视觉块 */
.command-room-adapter :deep(.chat-view .xiaojiu-conversation-card) {
  display: flex !important;
  flex-direction: column !important;
  height: 100%;
  min-height: 0;
  border: 0 !important;
  background: transparent !important;
}

/* 4. 消息列表：透明化，让 stage 底色透出来；强化滚动区 */
.command-room-adapter :deep(.chat-view .message-list) {
  padding: 24px 18px 14px !important;
  background: transparent !important;
  scroll-behavior: smooth;
}

.command-room-adapter :deep(.chat-view .message-list::-webkit-scrollbar) {
  width: 6px;
}

.command-room-adapter :deep(.chat-view .message-list::-webkit-scrollbar-thumb) {
  background: rgba(99, 231, 255, 0.2);
  border-radius: 999px;
}

/* 5. 空状态：改成小九式静默等待 */
.command-room-adapter :deep(.chat-view .empty-state) {
  color: #7f90aa !important;
  text-align: center;
  gap: 10px !important;
}

.command-room-adapter :deep(.chat-view .empty-logo) {
  filter: drop-shadow(0 0 24px rgba(99, 231, 255, 0.42));
  animation: xj-empty-breathe 5.2s ease-in-out infinite;
}

@keyframes xj-empty-breathe {
  0%, 100% { transform: scale(1); opacity: 0.9; }
  50% { transform: scale(1.04); opacity: 1; }
}

/* 6. 消息气泡：用户 / 助手 双色分层 */
.command-room-adapter :deep(.chat-view .message) {
  margin-bottom: 18px !important;
}

.command-room-adapter :deep(.chat-view .message .message-bubble) {
  padding: 12px 16px !important;
  border-radius: 16px !important;
  backdrop-filter: blur(10px);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.03) !important;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.command-room-adapter :deep(.chat-view .message.user .message-bubble) {
  color: #f3fbff !important;
  background: linear-gradient(
    135deg,
    rgba(99, 231, 255, 0.22),
    rgba(77, 141, 255, 0.12)
  ) !important;
  border: 1px solid rgba(99, 231, 255, 0.34) !important;
  border-bottom-right-radius: 6px !important;
}

.command-room-adapter :deep(.chat-view .message.assistant .message-bubble),
.command-room-adapter :deep(.chat-view .message.system .message-bubble) {
  color: #edf7ff !important;
  background: linear-gradient(
    180deg,
    rgba(12, 22, 42, 0.88),
    rgba(4, 9, 20, 0.72)
  ) !important;
  border: 1px solid rgba(99, 231, 255, 0.16) !important;
  border-bottom-left-radius: 6px !important;
}

.command-room-adapter :deep(.chat-view .message.system .message-bubble) {
  border-color: rgba(255, 211, 122, 0.28) !important;
  background: linear-gradient(180deg, rgba(42, 30, 12, 0.62), rgba(22, 16, 6, 0.42)) !important;
}

.command-room-adapter :deep(.chat-view .msg-avatar) {
  width: 30px !important;
  height: 30px !important;
  border-radius: 50% !important;
  border: 1px solid rgba(99, 231, 255, 0.38) !important;
  box-shadow: 0 0 14px rgba(99, 231, 255, 0.28);
  background:
    radial-gradient(circle at 40% 30%, rgba(99, 231, 255, 0.3), transparent 60%),
    linear-gradient(135deg, rgba(12, 22, 42, 0.9), rgba(4, 9, 20, 0.7)) !important;
}

.command-room-adapter :deep(.chat-view .message-time) {
  color: #5a6a86 !important;
  font-family: 'Fira Code', monospace !important;
  font-size: 10px !important;
  letter-spacing: 0.08em;
}

.command-room-adapter :deep(.chat-view .copy-bubble-btn) {
  color: #7f90aa !important;
  opacity: 0;
  transition: opacity 0.2s ease, color 0.2s ease;
}

.command-room-adapter :deep(.chat-view .message:hover .copy-bubble-btn) {
  opacity: 0.8;
}

.command-room-adapter :deep(.chat-view .copy-bubble-btn:hover) {
  color: #63e7ff !important;
  opacity: 1 !important;
}

/* 7. 思考块：让 reasoning 区有"透明思维腔"感 */
.command-room-adapter :deep(.chat-view .thinking-block) {
  margin-bottom: 10px !important;
  padding: 10px 14px !important;
  border: 1px dashed rgba(169, 140, 255, 0.32) !important;
  border-radius: 12px !important;
  background: linear-gradient(
    180deg,
    rgba(169, 140, 255, 0.08),
    rgba(99, 231, 255, 0.04)
  ) !important;
}

.command-room-adapter :deep(.chat-view .thinking-header) {
  color: #c3a8ff !important;
  font-family: 'Fira Code', monospace !important;
  font-size: 11px !important;
  letter-spacing: 0.1em;
  cursor: pointer;
}

.command-room-adapter :deep(.chat-view .thinking-label) {
  color: #c3a8ff !important;
}

.command-room-adapter :deep(.chat-view .thinking-meta) {
  color: #8075a8 !important;
  font-family: 'Fira Code', monospace !important;
  font-size: 10px !important;
}

.command-room-adapter :deep(.chat-view .thinking-body) {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px dashed rgba(169, 140, 255, 0.22);
  color: #cbb9f2 !important;
  font-size: 12.5px !important;
  line-height: 1.65;
  white-space: pre-wrap;
}

/* 8. 工具调用卡片：紧凑终端标签风格 */
.command-room-adapter :deep(.chat-view .message.tool) {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
}
.command-room-adapter :deep(.chat-view .tool-mini-card) {
  margin: 4px auto !important;
  padding: 0 !important;
  max-width: 480px !important;
  width: 100% !important;
  border: 1px solid rgba(99, 231, 255, 0.12) !important;
  border-radius: 8px !important;
  background: rgba(2, 6, 23, 0.6) !important;
  overflow: hidden;
  box-shadow: none !important;
  transition: border-color 0.2s ease;
}

.command-room-adapter :deep(.chat-view .tool-mini-card.is-running) {
  border-color: rgba(99, 231, 255, 0.35) !important;
  border-left: 3px solid #63e7ff !important;
}

.command-room-adapter :deep(.chat-view .tool-mini-card.is-done) {
  border-left: 3px solid rgba(110, 231, 183, 0.5) !important;
}

.command-room-adapter :deep(.chat-view .tool-mini-card.is-error) {
  border-left: 3px solid #ff6b8a !important;
  border-color: rgba(255, 107, 138, 0.35) !important;
}

.command-room-adapter :deep(.chat-view .tool-mini-head) {
  padding: 6px 10px !important;
  background: transparent !important;
  border-bottom: none !important;
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  cursor: pointer !important;
}

.command-room-adapter :deep(.chat-view .tool-chevron-wrap) {
  margin-left: auto !important;
  display: flex !important;
  align-items: center !important;
}

.command-room-adapter :deep(.chat-view .tool-status-dot) {
  width: 8px !important;
  height: 8px !important;
  border-radius: 50% !important;
  background: rgba(127, 144, 170, 0.5) !important;
  box-shadow: 0 0 0 0 transparent;
  flex-shrink: 0;
}

.command-room-adapter :deep(.chat-view .tool-mini-card.is-running .tool-status-dot),
.command-room-adapter :deep(.chat-view .tool-mini-card.is-running .tool-status-dot) {
  background: #63e7ff !important;
  box-shadow: 0 0 12px rgba(99, 231, 255, 0.85) !important;
  animation: xj-tool-pulse 1.2s ease-in-out infinite;
}

.command-room-adapter :deep(.chat-view .tool-mini-card.done .tool-status-dot),
.command-room-adapter :deep(.chat-view .tool-mini-card.is-done .tool-status-dot) {
  background: #6ee7b7 !important;
  box-shadow: 0 0 10px rgba(110, 231, 183, 0.7) !important;
}

.command-room-adapter :deep(.chat-view .tool-mini-card.error .tool-status-dot),
.command-room-adapter :deep(.chat-view .tool-mini-card.is-error .tool-status-dot) {
  background: #ff6b8a !important;
  box-shadow: 0 0 10px rgba(255, 107, 138, 0.7) !important;
}

@keyframes xj-tool-pulse {
  0%, 100% { transform: scale(0.85); opacity: 0.75; }
  50% { transform: scale(1.25); opacity: 1; }
}

.command-room-adapter :deep(.chat-view .tool-mini-title) {
  color: #63e7ff !important;
  font-family: 'Fira Code', monospace !important;
  font-size: 11px !important;
  font-weight: 620 !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase;
}

.command-room-adapter :deep(.chat-view .tool-mini-preview) {
  color: #b9c9de !important;
  font-family: 'Fira Code', monospace !important;
  font-size: 11.5px !important;
}

.command-room-adapter :deep(.chat-view .tool-state-label),
.command-room-adapter :deep(.chat-view .tool-meta-text) {
  color: #7f90aa !important;
  font-family: 'Fira Code', monospace !important;
  font-size: 10px !important;
  letter-spacing: 0.1em !important;
  text-transform: uppercase;
}

.command-room-adapter :deep(.chat-view .tool-details) {
  padding: 8px 10px 10px !important;
  background: transparent !important;
  border-top: 1px solid rgba(99, 231, 255, 0.08) !important;
}

.command-room-adapter :deep(.chat-view .tool-detail-label) {
  color: #7f90aa !important;
  font-family: 'Fira Code', monospace !important;
  font-size: 9.5px !important;
  letter-spacing: 0.18em !important;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.command-room-adapter :deep(.chat-view .tool-detail-code-block) {
  padding: 8px 10px !important;
  border: 1px solid rgba(99, 231, 255, 0.08) !important;
  border-radius: 6px !important;
  background: rgba(2, 6, 23, 0.5) !important;
  color: #cbe5ff !important;
  font-family: 'Fira Code', monospace !important;
  font-size: 12px !important;
  line-height: 1.6;
}

/* 9. 流式指示器与 tool-calls-panel：和工具卡统一语言 */
.command-room-adapter :deep(.chat-view .streaming-indicator) {
  margin: 6px 0 14px !important;
  padding: 10px 14px !important;
  border: 1px solid rgba(99, 231, 255, 0.18) !important;
  border-radius: 14px !important;
  background: linear-gradient(180deg, rgba(12, 22, 42, 0.76), rgba(4, 9, 20, 0.52)) !important;
}

.command-room-adapter :deep(.chat-view .tool-call-item) {
  border-radius: 10px !important;
  background: rgba(2, 6, 23, 0.58) !important;
  border: 1px solid rgba(99, 231, 255, 0.12) !important;
}

.command-room-adapter :deep(.chat-view .tool-call-name) {
  color: #63e7ff !important;
  font-family: 'Fira Code', monospace !important;
  font-size: 11px !important;
  letter-spacing: 0.08em;
}

.command-room-adapter :deep(.chat-view .tool-call-preview) {
  color: #b9c9de !important;
  font-family: 'Fira Code', monospace !important;
  font-size: 11px !important;
}

.command-room-adapter :deep(.chat-view .streaming-dots) {
  display: inline-flex;
  gap: 4px;
}

.command-room-adapter :deep(.chat-view .streaming-dots::before),
.command-room-adapter :deep(.chat-view .streaming-dots::after),
.command-room-adapter :deep(.chat-view .streaming-dots) {
  color: #63e7ff !important;
}

/* 10. 输入框：黑科技 command bar 感，贴底固定，与消息列表解耦滚动 */
.command-room-adapter :deep(.chat-view .chat-input-area) {
  padding: 12px 18px 16px !important;
  background:
    linear-gradient(180deg, rgba(2, 6, 23, 0) 0%, rgba(2, 6, 23, 0.68) 30%, rgba(2, 6, 23, 0.92) 100%) !important;
  border-top: 1px solid rgba(99, 231, 255, 0.1) !important;
  backdrop-filter: blur(14px);
}

.command-room-adapter :deep(.chat-view .input-top-bar) {
  padding: 0 4px 8px !important;
  color: #7f90aa !important;
  font-family: 'Fira Code', monospace !important;
  font-size: 10.5px !important;
  letter-spacing: 0.08em;
}

.command-room-adapter :deep(.chat-view .context-info) {
  color: #8db7d9 !important;
}

.command-room-adapter :deep(.chat-view .context-info.context-warning) {
  color: #ffd37a !important;
}

.command-room-adapter :deep(.chat-view .context-bar) {
  height: 3px !important;
  border-radius: 999px !important;
  background: rgba(99, 231, 255, 0.1) !important;
  overflow: hidden;
}

.command-room-adapter :deep(.chat-view .context-bar-fill) {
  background: linear-gradient(90deg, #63e7ff, #4d8dff) !important;
  box-shadow: 0 0 10px rgba(99, 231, 255, 0.6);
}

.command-room-adapter :deep(.chat-view .input-wrapper) {
  position: relative;
  border: 1px solid rgba(99, 231, 255, 0.22) !important;
  border-radius: 18px !important;
  background: linear-gradient(
    180deg,
    rgba(12, 22, 42, 0.78),
    rgba(4, 9, 20, 0.62)
  ) !important;
  box-shadow:
    0 18px 48px rgba(0, 0, 0, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.045) !important;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.command-room-adapter :deep(.chat-view .input-wrapper:focus-within) {
  border-color: rgba(99, 231, 255, 0.58) !important;
  box-shadow:
    0 0 0 3px rgba(99, 231, 255, 0.12),
    0 22px 52px rgba(99, 231, 255, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
}

.command-room-adapter :deep(.chat-view .input-wrapper.drag-over) {
  border-color: #63e7ff !important;
  background: rgba(99, 231, 255, 0.08) !important;
}

.command-room-adapter :deep(.chat-view .input-textarea) {
  color: #edf7ff !important;
  background: transparent !important;
  border: 0 !important;
  padding: 14px 16px !important;
  font-size: 14px !important;
  line-height: 1.6;
  caret-color: #63e7ff;
  outline: none;
}

.command-room-adapter :deep(.chat-view .input-textarea::placeholder) {
  color: rgba(127, 144, 170, 0.58) !important;
  font-style: italic;
}

.command-room-adapter :deep(.chat-view .input-actions) {
  padding: 4px 10px 10px !important;
  gap: 6px;
}

.command-room-adapter :deep(.chat-view .input-actions .n-button),
.command-room-adapter :deep(.chat-view .input-actions button) {
  color: #b9c9de !important;
  background: transparent !important;
  border: 1px solid transparent !important;
  border-radius: 10px !important;
  transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease !important;
}

.command-room-adapter :deep(.chat-view .input-actions .n-button:hover),
.command-room-adapter :deep(.chat-view .input-actions button:hover) {
  color: #63e7ff !important;
  background: rgba(99, 231, 255, 0.08) !important;
  border-color: rgba(99, 231, 255, 0.22) !important;
}

.command-room-adapter :deep(.chat-view .attachment-previews) {
  padding: 6px 4px 8px !important;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.command-room-adapter :deep(.chat-view .attachment-preview) {
  border: 1px solid rgba(99, 231, 255, 0.22) !important;
  border-radius: 10px !important;
  background: rgba(12, 22, 42, 0.78) !important;
  padding: 6px 10px !important;
  color: #cbe5ff !important;
}

.command-room-adapter :deep(.chat-view .attachment-remove) {
  color: rgba(255, 107, 138, 0.7) !important;
  background: transparent !important;
  border: 0 !important;
}

.command-room-adapter :deep(.chat-view .attachment-remove:hover) {
  color: #ff6b8a !important;
}

/* 11. 附件（消息内）卡片 */
.command-room-adapter :deep(.chat-view .msg-attachment) {
  border: 1px solid rgba(99, 231, 255, 0.18) !important;
  border-radius: 12px !important;
  background: rgba(2, 6, 23, 0.5) !important;
  overflow: hidden;
}

.command-room-adapter :deep(.chat-view .msg-attachment-file) {
  padding: 10px 12px !important;
  color: #cbe5ff !important;
}

.command-room-adapter :deep(.chat-view .att-name) {
  color: #edf7ff !important;
}

.command-room-adapter :deep(.chat-view .att-size),
.command-room-adapter :deep(.chat-view .att-download-icon) {
  color: #7f90aa !important;
}

@media (max-width: 1180px) {
  .stage-title { font-size: 19px; }
  .stage-subtitle { font-size: 11.5px; }
  .telemetry-item { min-width: 84px; padding: 6px 10px; }
  .tvalue { font-size: 11px; max-width: 140px; }
}
</style>
