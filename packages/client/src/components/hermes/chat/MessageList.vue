<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import MessageItem from "./MessageItem.vue";
import { useChatStore } from "@/stores/hermes/chat";
import thinkingVideoLight from "@/assets/thinking-light.mp4";
import thinkingVideoDark from "@/assets/thinking-dark.mp4";
import { useTheme } from "@/composables/useTheme";

const chatStore = useChatStore();
const { t } = useI18n();
const { isDark } = useTheme();
const listRef = ref<HTMLElement>();

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function formatToolDuration(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`
  if (seconds < 60) return `${Math.round(seconds * 10) / 10}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}m ${secs}s`
}

const TOOL_NAME_MAP: Record<string, string> = {
  terminal: '终端',
  web_search: '联网搜索',
  read_file: '读文件',
  write_file: '写文件',
  patch: '改文件',
  search_files: '搜文件',
  browser_navigate: '打开网页',
  browser_click: '点击页面',
  browser_type: '输入文字',
  browser_snapshot: '页面截图',
  browser_console: '浏览器控制台',
  browser_scroll: '滚动页面',
  browser_back: '浏览器后退',
  browser_press: '按键操作',
  browser_get_images: '提取图片',
  browser_vision: '视觉分析',
  browser_cdp: 'CDP调试',
  browser_dialog: '对话框',
  execute_code: '执行代码',
  web_extract: '提取网页',
  web_crawl: '网页爬取',
  vision_analyze: '图片分析',
  delegate_task: '分配任务',
  todo: '任务清单',
  memory: '记忆系统',
  skill_manage: '技能管理',
  skill_view: '查看技能',
  skills_list: '技能列表',
  text_to_speech: '语音合成',
  clarify: '询问确认',
  process: '进程管理',
  cronjob: '定时任务',
  image_generate: '生成图片',
  tavily_search: '联网搜索',
  llm_wiki: '知识库',
  session_search: '记忆召回',
  send_message: '发送消息',
  mixture_of_agents: 'MoA推理',
  'rl_list_environments': 'RL环境',
  'rl_select_environment': 'RL选择环境',
  'rl_get_current_config': 'RL配置',
  'rl_edit_config': 'RL编辑配置',
  'rl_start_training': 'RL训练',
  'rl_check_status': 'RL状态',
  'rl_stop_training': 'RL停止',
  'rl_get_results': 'RL结果',
  'rl_list_runs': 'RL列表',
  'rl_test_inference': 'RL推理',
}

function getToolLabel(name: string): string {
  return TOOL_NAME_MAP[name] || name
}

const displayMessages = computed(() =>
  chatStore.messages.filter((m) => {
    if (m.role === 'tool') return !!m.toolName;
    if (!m.content?.trim() && !m.reasoning?.trim()) return false;
    return true;
  }),
);

const currentToolCalls = computed(() => {
  const msgs = chatStore.messages;
  // Find the last user message index
  let lastUserIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  // Only tool calls after the last user message, newest on top
  const tools = msgs.filter((m, i) => m.role === "tool" && i > lastUserIdx);
  return [...tools].reverse();
});

// Phases from the currently streaming assistant message
const streamingPhases = computed(() => {
  const msgs = chatStore.messages;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant' && msgs[i].isStreaming) {
      return msgs[i].phases || [];
    }
  }
  return [];
});

function isNearBottom(threshold = 200): boolean {
  const el = listRef.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

function scrollToBottom() {
  nextTick(() => {
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight;
    }
  });
}

function scrollToMessage(messageId: string) {
  nextTick(() => {
    const el = document.getElementById(`message-${messageId}`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
    }
  });
}

// Scroll to bottom on session switch
watch(
  () => chatStore.activeSessionId,
  (id) => {
    if (!id) return;
    if (chatStore.focusMessageId) {
      nextTick(() => scrollToMessage(chatStore.focusMessageId!));
      return;
    }
    nextTick(() => scrollToBottom());
  },
  { immediate: true },
);

watch(
  () => chatStore.focusMessageId,
  (messageId) => {
    if (!messageId) return;
    scrollToMessage(messageId);
  },
);

// When a run starts (user just sent a message), always scroll to bottom once
watch(
  () => chatStore.isRunActive,
  (v) => {
    if (v) scrollToBottom();
  },
);

// During streaming, only auto-scroll if the user is already near the bottom
watch(
  () => chatStore.messages[chatStore.messages.length - 1]?.content,
  () => {
    if (chatStore.focusMessageId) {
      scrollToMessage(chatStore.focusMessageId);
      return;
    }
    if (!isNearBottom()) return;
    scrollToBottom();
  },
);
watch(currentToolCalls, () => {
  if (chatStore.focusMessageId) {
    scrollToMessage(chatStore.focusMessageId);
    return;
  }
  if (!isNearBottom()) return;
  scrollToBottom();
});
</script>

<template>
  <div ref="listRef" class="message-list">
    <div v-if="chatStore.messages.length === 0" class="empty-state">
      <img src="/logo.png" alt="小九中枢" class="empty-logo" />
      <p>{{ t("chat.emptyState") }}</p>
    </div>
    <MessageItem
      v-for="msg in displayMessages"
      :key="msg.id"
      :message="msg"
      :highlight="chatStore.focusMessageId === msg.id"
    />
    <Transition name="fade">
      <div v-if="chatStore.isRunActive" class="streaming-indicator">
        <!-- Thinking + tool phases chain — replaces the video -->
        <div v-if="streamingPhases.length > 0" class="phases-chain">
          <div
            v-for="phase in streamingPhases"
            :key="phase.id"
            class="phase-item"
            :class="[`phase-${phase.type}`, { 'is-running': phase.isStreaming, 'is-done': phase.toolStatus === 'done', 'is-error': phase.toolStatus === 'error' }]"
          >
            <!-- Thinking phase -->
            <template v-if="phase.type === 'thinking'">
              <svg
                width="10" height="10" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                class="phase-icon"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span class="phase-icon-text">💭</span>
              <span class="phase-label">{{ t('chat.thinkingLabel') || '思考' }}</span>
              <span v-if="phase.isStreaming" class="phase-streaming-dots">
                <span></span><span></span><span></span>
              </span>
            </template>
            <!-- Tool call phase -->
            <template v-else-if="phase.type === 'tool_call'">
              <!-- Orb status indicator -->
              <div class="phase-tool-orb" :class="`is-${phase.toolStatus || 'running'}`">
                <span class="phase-tool-dot"></span>
              </div>
              <span class="phase-kicker">TOOL RUN</span>
              <span class="phase-tool-name">{{ getToolLabel(phase.toolName || '') || '工具' }}</span>
              <span v-if="phase.toolPreview" class="phase-tool-preview">{{ phase.toolPreview }}</span>
              <span v-if="phase.toolDuration && phase.toolStatus !== 'running'" class="phase-tool-duration">
                {{ formatToolDuration(phase.toolDuration) }}
              </span>
            </template>
            <!-- Tool result phase -->
            <template v-else-if="phase.type === 'tool_result'">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="phase-icon">
                <path d="M9 11l3 3L22 4"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
              </svg>
              <span class="phase-label">结果</span>
              <span v-if="phase.content" class="phase-result-preview">{{ phase.content.slice(0, 60) }}{{ phase.content.length > 60 ? '...' : '' }}</span>
            </template>
            <!-- Final phase -->
            <template v-else-if="phase.type === 'final'">
              <span class="phase-icon-text">✏️</span>
              <span class="phase-label">{{ t('chat.responseLabel') || '回复' }}</span>
            </template>
          </div>
        </div>
        <!-- Fallback video when no phases yet -->
        <video
          v-else
          :src="isDark ? thinkingVideoDark : thinkingVideoLight"
          autoplay
          loop
          muted
          playsinline
          class="thinking-video"
        />
        <div v-if="currentToolCalls.length > 0 || chatStore.compressionState" class="tool-calls-panel">
          <!-- Compression indicator -->
          <div v-if="chatStore.compressionState" class="tool-call-item compression-item">
            <svg
              v-if="chatStore.compressionState.compressing"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              class="tool-call-icon"
            >
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <svg
              v-else-if="chatStore.compressionState.compressed"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              class="tool-call-icon"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
            <span class="tool-call-name">
              {{
                chatStore.compressionState.compressing
                  ? `Compressing... (${chatStore.compressionState.messageCount} msgs, ~${formatTokens(chatStore.compressionState.beforeTokens)} tokens)`
                  : chatStore.compressionState.compressed
                    ? `Compressed ${chatStore.compressionState.messageCount} msgs: ~${formatTokens(chatStore.compressionState.beforeTokens)} → ~${formatTokens(chatStore.compressionState.afterTokens)} tokens`
                    : `Compression skipped`
              }}
            </span>
            <span
              v-if="chatStore.compressionState.compressing"
              class="tool-call-spinner"
            ></span>
          </div>
          <!-- Tool calls -->
          <div
            v-for="tc in currentToolCalls"
            :key="tc.id"
            class="tool-call-item"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              class="tool-call-icon"
            >
              <path
                d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
              />
            </svg>
            <span class="tool-call-name">{{ getToolLabel(tc.toolName || '') }}</span>
            <span v-if="tc.toolPreview" class="tool-call-preview">{{
              tc.toolPreview
            }}</span>
            <span
              v-if="tc.toolDuration && tc.toolStatus !== 'running'"
              class="tool-call-duration"
              :title="$t('chat.executionDuration')"
            >{{ formatToolDuration(tc.toolDuration) }}</span
            >
            <svg
              v-if="tc.toolStatus === 'done'"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              class="tool-call-success-icon"
            >
              <circle cx="12" cy="12" r="10" fill="currentColor" fill-opacity="0.15"/>
              <path
                d="M8 12L11 15L16 9"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
              />
            </svg>
            <span
              v-if="tc.toolStatus === 'running'"
              class="tool-call-spinner"
            ></span>
            <svg
              v-if="tc.toolStatus === 'error'"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              class="tool-call-error-icon"
            >
              <circle cx="12" cy="12" r="10" fill="currentColor" fill-opacity="0.15"/>
              <path
                d="M15 9L9 15M9 9L15 15"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
              />
            </svg>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background-color: $bg-card;

  // tool 卡片间距单独收紧
  .message.tool {
    gap: 0;
    margin: 1px 0;
  }

  .dark & {
    background-color: #333333;
  }
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: $text-muted;
  gap: 12px;

  .empty-logo {
    width: 48px;
    height: 48px;
    opacity: 0.25;
  }

  p {
    font-size: 14px;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.streaming-indicator {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 4px;
  .thinking-video {
    width: 120px;
    height: 213px;
    border-radius: $radius-md;
    object-fit: contain;
    flex-shrink: 0;
  }
}

.tool-calls-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 213px;
  overflow-y: auto;
  padding-top: 4px;
  scrollbar-width: none;
  -ms-overflow-style: none;
  &::-webkit-scrollbar {
    display: none;
  }
}

.tool-call-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: $text-secondary;
  padding: 3px 8px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: $radius-sm;

  .dark & {
    background: rgba(255, 255, 255, 0.06);
  }

  &.compression-item {
    color: $text-muted;
    font-size: 10px;
  }

  .tool-call-icon {
    flex-shrink: 0;
    color: $text-muted;
  }

  .tool-call-name {
    font-family: $font-code;
    flex-shrink: 0;
  }

  .tool-call-preview {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 300px;
    color: $text-muted;
  }
}

.tool-call-spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid $text-muted;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
}

.tool-call-error-icon {
  color: #ff4d4f;
  flex-shrink: 0;
  margin-left: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-call-duration {
  font-size: 10px;
  color: $text-muted;
  font-family: $font-code;
  margin-left: 4px;
  flex-shrink: 0;
}

.tool-call-success-icon {
  color: #52c41a;
  flex-shrink: 0;
  margin-left: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

// Phases chain — inline thinking/tool/result/reply sequence in streaming indicator
.phases-chain {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 213px;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  &::-webkit-scrollbar {
    display: none;
  }
}

.phase-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: $text-secondary;
  padding: 3px 8px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: $radius-sm;
  border-left: 3px solid transparent;
  transition: border-color 0.2s ease;

  .dark & {
    background: rgba(255, 255, 255, 0.06);
  }

  &.is-running {
    border-left-color: #00d4ff;
  }

  &.is-done {
    border-left-color: #00e5a0;
  }

  &.is-error {
    border-left-color: #ff6b8a;
  }

  &.phase-thinking {
    border-left-color: #a78bfa;
  }

  &.phase-tool_call {
    border-left-color: rgba(var(--text-muted-rgb, 128, 128, 128), 0.55);
  }

  &.phase-final {
    border-left-color: #60a5fa;
  }
}

// Orb status indicator (matches tool-mini-card)
.phase-tool-orb {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, rgba(var(--text-primary-rgb), 0.1), rgba(var(--text-primary-rgb), 0.025));
  border: 1px solid rgba(var(--text-primary-rgb), 0.09);
  flex-shrink: 0;
}

.phase-tool-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: $text-muted;
  opacity: 0.8;

  .is-running & {
    background: #00d4ff;
    opacity: 1;
    animation: pulse-dot 1.2s ease-in-out infinite;
    box-shadow: 0 0 0 4px rgba(0, 212, 255, 0.08), 0 0 12px rgba(0, 212, 255, 0.4);
  }

  .is-done & {
    background: #00e5a0;
    opacity: 1;
    box-shadow: 0 0 0 4px rgba(0, 229, 160, 0.08);
  }

  .is-error & {
    background: #ff6b8a;
    opacity: 1;
    box-shadow: 0 0 0 4px rgba(255, 107, 138, 0.1);
  }
}

@keyframes pulse-dot {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.15); opacity: 0.85; }
}

.phase-kicker {
  font-family: $font-code;
  font-size: 9px;
  letter-spacing: 0.12em;
  color: $text-muted;
  border: 1px solid rgba(var(--text-primary-rgb), 0.12);
  border-radius: 999px;
  padding: 1px 6px;
  background: rgba(var(--text-primary-rgb), 0.035);
  flex-shrink: 0;
}

.phase-icon {
  flex-shrink: 0;
  color: $text-muted;
}

.phase-icon-text {
  font-size: 11px;
  flex-shrink: 0;
}

.phase-label {
  font-family: $font-code;
  font-size: 11px;
  color: $text-secondary;
  flex-shrink: 0;
}

.phase-streaming-dots {
  display: inline-flex;
  gap: 2px;
  margin-left: 4px;

  span {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: $text-muted;
    animation: dot-bounce 1.2s infinite;

    &:nth-child(2) { animation-delay: 0.2s; }
    &:nth-child(3) { animation-delay: 0.4s; }
  }
}

@keyframes dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-4px); opacity: 1; }
}

.phase-tool-name {
  font-family: $font-code;
  font-size: 12px;
  font-weight: 700;
  color: $text-primary;
  flex-shrink: 0;
}

.phase-tool-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
  color: $text-muted;
  font-size: 11px;
}

.phase-tool-duration {
  font-size: 10px;
  color: $text-muted;
  font-family: $font-code;
  margin-left: 4px;
  flex-shrink: 0;
}

.phase-status-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 2px;
}

.phase-success {
  color: #52c41a;
}

.phase-error-icon {
  color: #ff4d4f;
}

.phase-spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid $text-muted;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
}

.phase-result-preview {
  font-size: 10px;
  color: $text-muted;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}
</style>
