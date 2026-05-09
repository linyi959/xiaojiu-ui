<script setup lang="ts">
import type { Message } from "@/stores/hermes/chat";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  handleCodeBlockCopyClick,
  renderHighlightedCodeBlock,
} from "./highlight";

const TOOL_PAYLOAD_DISPLAY_LIMIT = 2000;

const props = defineProps<{
  message: Pick<Message, 'toolName' | 'toolPreview' | 'toolArgs' | 'toolResult' | 'toolStatus' | 'toolDuration' | 'content'>
  embedded?: boolean
}>();

const { t } = useI18n();
const toolExpanded = ref(false);

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatToolDurationSeconds(seconds?: number): string | null {
  if (seconds === undefined || seconds === null) return null;
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${Math.round(seconds * 10) / 10}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function formatToolPayload(raw?: string, truncatedLabel = 'truncated'): { display: string; full: string; language: string } {
  if (!raw) return { display: "", full: "", language: "json" };
  let text = raw;
  let language = "json";
  try {
    const parsed = JSON.parse(raw);
    text = JSON.stringify(parsed, null, 2);
  } catch {
    language = "text";
  }
  const display = text.length > TOOL_PAYLOAD_DISPLAY_LIMIT
    ? `${text.slice(0, TOOL_PAYLOAD_DISPLAY_LIMIT)}\n${truncatedLabel} ${text.length - TOOL_PAYLOAD_DISPLAY_LIMIT} chars`
    : text;
  return { display, full: text, language };
}

function renderToolPayload(content: string, language: string): string {
  return renderHighlightedCodeBlock(content, language, t("common.copy"), {
    maxHighlightLength: TOOL_PAYLOAD_DISPLAY_LIMIT,
  });
}

function handleToolDetailClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const copyBtn = target?.closest('[data-copy-code]') as HTMLElement | null;
  if (copyBtn) {
    event.preventDefault();
    const section = copyBtn.closest('[data-copy-source]') as HTMLElement | null;
    const source = section?.dataset.copySource;
    const fullText = source === 'tool-args'
      ? toolArgsPayload.value.full
      : source === 'tool-result'
        ? toolResultPayload.value.full
        : '';
    if (fullText) {
      void navigator.clipboard?.writeText(fullText);
      return;
    }
    handleCodeBlockCopyClick(event);
  }
}

const hasToolDetails = computed(
  () => !!(props.message.toolArgs || props.message.toolResult),
);

const toolStatusClass = computed(() => {
  const s = props.message.toolStatus || ''
  if (s === 'running') return 'is-running'
  if (s === 'error') return 'is-error'
  if (s === 'done') return 'is-done'
  return ''
})

const toolLabel = computed(() => {
  const name = props.message.toolName || '';
  return TOOL_NAME_MAP[name] || name || 'tool';
});

const toolStatusText = computed(() => {
  const s = props.message.toolStatus;
  if (s === 'running') return '运行中';
  if (s === 'error') return t('chat.error');
  if (s === 'done') return '完成';
  return '待命';
});

const toolStatusMeta = computed(() => {
  const duration = formatToolDurationSeconds(props.message.toolDuration);
  if (duration && props.message.toolStatus !== 'running') return duration;
  if (props.message.toolStatus === 'running') return '实时执行';
  if (props.message.toolStatus === 'error') return '需要查看输出';
  return '工具调用';
});

const toolRouteLabel = computed(() => {
  const raw = props.message.toolName || 'tool';
  const [namespace, action] = raw.includes('.') ? raw.split('.', 2) : raw.split('_', 2);
  if (!action) return raw;
  return `${namespace} / ${action}`;
});

const toolResultSummary = computed(() => {
  if (props.message.toolPreview) return props.message.toolPreview;
  const raw = props.message.toolResult || props.message.content || '';
  if (!raw.trim()) return '';
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') return parsed.slice(0, 140);
    if (parsed?.error) return String(parsed.error).slice(0, 140);
    if (parsed?.output) return String(parsed.output).slice(0, 140);
    if (parsed?.content) return String(parsed.content).slice(0, 140);
    if (parsed?.result) return String(parsed.result).slice(0, 140);
    const keys = Object.keys(parsed || {}).slice(0, 4);
    if (keys.length) return keys.map((key) => `${key}: ${JSON.stringify(parsed[key]).slice(0, 36)}`).join(' · ');
  } catch {
    return raw.replace(/\s+/g, ' ').slice(0, 140);
  }
  return '';
});

const toolArgCount = computed(() => {
  const raw = props.message.toolArgs;
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return Object.keys(parsed).length;
    if (Array.isArray(parsed)) return parsed.length;
  } catch {
    return raw.trim() ? 1 : 0;
  }
  return 0;
});

const toolResultSize = computed(() => {
  const raw = props.message.toolResult || props.message.content || '';
  if (!raw) return null;
  return formatSize(new Blob([raw]).size);
});

const toolHasResult = computed(() => !!(props.message.toolResult || props.message.content));

const toolActionText = computed(() => {
  if (!hasToolDetails.value) return '';
  return toolExpanded.value ? '收起工程细节' : '查看工程细节';
});

const toolMetaActionText = computed(() => {
  if (hasToolDetails.value) return toolActionText.value;
  if (props.message.toolStatus === 'running') return '等待回传';
  if (props.message.toolStatus === 'error') return '无错误详情';
  return '已完成';
});

const toolArgsPayload = computed(() => formatToolPayload(props.message.toolArgs, t('chat.truncated')));
const toolResultPayload = computed(() => formatToolPayload(props.message.toolResult, t('chat.truncated')));

const formattedToolArgs = computed(() => toolArgsPayload.value.display);
const formattedToolResult = computed(() => toolResultPayload.value.display);

const renderedToolArgs = computed(() => {
  if (!formattedToolArgs.value) return "";
  return renderToolPayload(
    formattedToolArgs.value,
    toolArgsPayload.value.language,
  );
});

const renderedToolResult = computed(() => {
  if (!formattedToolResult.value) return "";
  return renderToolPayload(
    formattedToolResult.value,
    toolResultPayload.value.language,
  );
});
</script>

<template>
  <div
    class="tool-mini-card"
    :class="[toolStatusClass, { expanded: toolExpanded, embedded }]"
  >
    <div class="tool-mini-head tool-line" @click="hasToolDetails && (toolExpanded = !toolExpanded)">
      <div class="tool-orb" aria-hidden="true">
        <span class="tool-status-dot"></span>
      </div>
      <div class="tool-title-stack">
        <div class="tool-title-row">
          <span class="tool-kicker">TOOL RUN</span>
          <span class="tool-mini-title">{{ toolLabel }}</span>
          <span class="tool-route-label">{{ toolRouteLabel }}</span>
        </div>
        <div v-if="toolResultSummary" class="tool-mini-preview">{{ toolResultSummary }}</div>
      </div>
      <div class="tool-metrics">
        <span class="tool-state-label">{{ toolStatusText }}</span>
        <span v-if="toolStatusMeta" class="tool-duration-chip">{{ toolStatusMeta }}</span>
      </div>
      <span v-if="hasToolDetails" class="tool-chevron-wrap" :title="toolActionText">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          class="tool-chevron" :class="{ rotated: toolExpanded }">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </span>
    </div>
    <div class="tool-meta-strip">
      <span v-if="toolArgCount" class="tool-meta-pill">参数 {{ toolArgCount }}</span>
      <span v-if="toolHasResult" class="tool-meta-pill">结果 {{ toolResultSize }}</span>
      <span class="tool-meta-pill">{{ toolMetaActionText }}</span>
    </div>
    <div v-if="toolExpanded && hasToolDetails" class="tool-details" @click="handleToolDetailClick">
      <div v-if="formattedToolArgs" class="tool-detail-section" data-copy-source="tool-args">
        <div class="tool-detail-label">
          <span>{{ t("chat.arguments") }}</span>
          <span class="tool-detail-hint">copyable json</span>
        </div>
        <div class="tool-detail-code-block" v-html="renderedToolArgs"></div>
      </div>
      <div v-if="formattedToolResult" class="tool-detail-section" data-copy-source="tool-result">
        <div class="tool-detail-label">
          <span>{{ t("chat.result") }}</span>
          <span class="tool-detail-hint">{{ toolResultSize }}</span>
        </div>
        <div class="tool-detail-code-block" v-html="renderedToolResult"></div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.tool-mini-card {
  width: min(720px, calc(100% - 84px));
  margin: 4px 0 4px 48px;
  position: relative;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid rgba(var(--text-primary-rgb), 0.1);
  background:
    linear-gradient(135deg, rgba(var(--text-primary-rgb), 0.085), rgba(var(--text-primary-rgb), 0.025)),
    rgba(var(--bg-card-rgb, 255, 255, 255), 0.72);
  box-shadow:
    0 14px 34px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;

  &.embedded {
    width: 100%;
    margin: 8px 0 0;
  }

  &::before {
    content: "";
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: rgba(var(--text-muted-rgb), 0.55);
  }

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(circle at 16% 0%, rgba(255, 255, 255, 0.16), transparent 32%),
      linear-gradient(90deg, rgba(255, 255, 255, 0.06), transparent 28%);
    opacity: 0.65;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(var(--text-primary-rgb), 0.18);
    box-shadow:
      0 18px 44px rgba(0, 0, 0, 0.11),
      inset 0 1px 0 rgba(255, 255, 255, 0.22);
  }

  &.is-running {
    border-color: rgba(0, 212, 255, 0.35);

    &::before {
      background: linear-gradient(180deg, #00d4ff, rgba(0, 212, 255, 0.25));
      box-shadow: 0 0 18px rgba(0, 212, 255, 0.5);
    }
  }

  &.is-done {
    border-color: rgba(0, 229, 160, 0.25);

    &::before {
      background: linear-gradient(180deg, #00e5a0, rgba(0, 229, 160, 0.2));
    }
  }

  &.is-error {
    border-color: rgba(255, 107, 138, 0.35);

    &::before {
      background: linear-gradient(180deg, #ff6b8a, rgba(255, 107, 138, 0.25));
    }
  }

  .dark & {
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.025)),
      rgba(2, 6, 23, 0.62);
    border-color: rgba(255, 255, 255, 0.09);
    box-shadow:
      0 16px 42px rgba(0, 0, 0, 0.24),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .tool-mini-head {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    padding: 11px 14px 8px 16px;
    cursor: pointer;
    user-select: none;

    &:hover {
      background: rgba(var(--text-primary-rgb), 0.025);
    }
  }

  .tool-orb {
    width: 30px;
    height: 30px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background:
      linear-gradient(135deg, rgba(var(--text-primary-rgb), 0.1), rgba(var(--text-primary-rgb), 0.025));
    border: 1px solid rgba(var(--text-primary-rgb), 0.09);
  }

  .tool-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background: $text-muted;
    opacity: 0.8;

    .is-running & {
      background: #00d4ff;
      opacity: 1;
      animation: pulse-dot 1.2s ease-in-out infinite;
      box-shadow: 0 0 0 6px rgba(0, 212, 255, 0.08), 0 0 16px rgba(0, 212, 255, 0.45);
    }

    .is-done & {
      background: #00e5a0;
      opacity: 1;
      box-shadow: 0 0 0 6px rgba(0, 229, 160, 0.08);
    }

    .is-error & {
      background: #ff6b8a;
      opacity: 1;
      box-shadow: 0 0 0 6px rgba(255, 107, 138, 0.1);
    }
  }

  .tool-title-stack {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tool-title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tool-kicker {
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

  .tool-mini-title {
    font-size: 13px;
    font-weight: 700;
    color: $text-primary;
    flex-shrink: 0;
  }

  .tool-route-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: $font-code;
    font-size: 11px;
    color: $text-muted;
  }

  .tool-mini-preview {
    min-width: 0;
    font-size: 12px;
    color: $text-secondary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tool-metrics {
    display: flex;
    align-items: flex-end;
    flex-direction: column;
    gap: 3px;
    flex-shrink: 0;
  }

  .tool-state-label {
    font-size: 11px;
    font-weight: 700;
    color: $text-primary;
    line-height: 1;
  }

  .tool-duration-chip {
    font-family: $font-code;
    font-size: 10px;
    color: $text-muted;
    line-height: 1;
  }

  .tool-chevron-wrap {
    width: 24px;
    height: 24px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    color: $text-muted;
    background: rgba(var(--text-primary-rgb), 0.035);
  }

  .tool-chevron {
    transition: transform 0.2s ease;

    &.rotated {
      transform: rotate(90deg);
    }
  }

  .tool-meta-strip {
    position: relative;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 14px 10px 56px;
  }

  .tool-meta-pill {
    font-size: 10px;
    color: $text-muted;
    border-radius: 999px;
    padding: 2px 7px;
    background: rgba(var(--text-primary-rgb), 0.045);
    border: 1px solid rgba(var(--text-primary-rgb), 0.07);
  }

  .tool-details {
    position: relative;
    z-index: 1;
    margin: 0 10px 10px 56px;
    padding: 10px;
    border-top: 1px solid rgba(var(--text-primary-rgb), 0.08);
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.08);

    .dark & {
      background: rgba(0, 0, 0, 0.24);
      border-color: rgba(255, 255, 255, 0.07);
    }

    .tool-detail-section {
      margin-bottom: 10px;

      &:last-child {
        margin-bottom: 0;
      }
    }

    .tool-detail-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      font-size: 10px;
      font-weight: 700;
      color: $text-muted;
      margin-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .tool-detail-hint {
      font-family: $font-code;
      font-weight: 500;
      letter-spacing: 0;
      text-transform: none;
      opacity: 0.75;
    }

    .tool-detail-code-block {
      background: rgba(0, 0, 0, 0.16);
      border: 1px solid rgba(var(--text-primary-rgb), 0.08);
      border-radius: 9px;
      overflow: hidden;

      :deep(.hljs-code-block) {
        margin: 0;
        border: none;
        background: transparent;
      }

      :deep(.code-header) {
        background: rgba(var(--text-primary-rgb), 0.04);
      }

      :deep(pre) {
        margin: 0;
        font-size: 11px;
      }

      :deep(code),
      :deep(code.hljs) {
        font-size: 11px;
        max-height: 320px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }
    }
  }
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.85); }
}
</style>
