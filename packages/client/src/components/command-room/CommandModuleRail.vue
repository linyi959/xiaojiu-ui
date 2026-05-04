<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const homeEntry: ModuleEntry = {
  name: 'hermes.home',
  path: '/hermes/home',
  label: '首页总览',
  short: 'HOME',
  icon: 'home',
}

type ModuleEntry = {
  name: string
  path: string
  label: string
  short: string
  icon: string
}

type ModuleGroup = {
  key: string
  title: string
  modules: ModuleEntry[]
}

// 五大模块分组，严格遵循设计契约 docs/xiaojiu-command-core-design-contract.md
const moduleGroups: ModuleGroup[] = [
  {
    key: 'chat',
    title: '对话中枢',
    modules: [
      { name: 'hermes.chat', path: '/hermes/chat', label: '对话核心', short: 'CHAT', icon: 'chat' },
      { name: 'hermes.history', path: '/hermes/history', label: '会话历史', short: 'HIST', icon: 'history' },
      { name: 'hermes.groupChat', path: '/hermes/group-chat', label: '群组协作', short: 'GROUP', icon: 'group' },
    ],
  },
  {
    key: 'missions',
    title: '任务指挥',
    modules: [
      { name: 'hermes.monitor', path: '/hermes/monitor', label: '任务雷达', short: 'RDR', icon: 'radar' },
      { name: 'hermes.jobs', path: '/hermes/jobs', label: '自动任务', short: 'JOBS', icon: 'jobs' },
      { name: 'hermes.usage', path: '/hermes/usage', label: '用量统计', short: 'USE', icon: 'usage' },
      { name: 'hermes.logs', path: '/hermes/logs', label: '运行日志', short: 'LOG', icon: 'log' },
    ],
  },
  {
    key: 'memory',
    title: '记忆与知识',
    modules: [
      { name: 'hermes.memory', path: '/hermes/memory', label: '记忆系统', short: 'MEM', icon: 'memory' },
      { name: 'hermes.files', path: '/hermes/files', label: '文件舱', short: 'FILES', icon: 'files' },
    ],
  },
  {
    key: 'arsenal',
    title: '能力兵器库',
    modules: [
      { name: 'hermes.skills', path: '/hermes/skills', label: '技能库', short: 'SKILL', icon: 'skill' },
      { name: 'hermes.models', path: '/hermes/models', label: '模型核心', short: 'MODEL', icon: 'model' },
      { name: 'hermes.terminal', path: '/hermes/terminal', label: '执行终端', short: 'TERM', icon: 'terminal' },
      { name: 'hermes.gateways', path: '/hermes/gateways', label: '网关', short: 'GATE', icon: 'gateway' },
      { name: 'hermes.channels', path: '/hermes/channels', label: '频道', short: 'CHAN', icon: 'channel' },
    ],
  },
  {
    key: 'system',
    title: '系统驾驶舱',
    modules: [
      { name: 'hermes.profiles', path: '/hermes/profiles', label: '档案', short: 'PROF', icon: 'profile' },
      { name: 'hermes.settings', path: '/hermes/settings', label: '设置', short: 'CFG', icon: 'settings' },
    ],
  },
]

const activeMeta = computed(() => {
  if (route.name === homeEntry.name) {
    return { ...homeEntry, group: '中枢总览' }
  }

  for (const group of moduleGroups) {
    const found = group.modules.find(item => item.name === route.name)
    if (found) return { ...found, group: group.title }
  }
  return { name: String(route.name || ''), short: 'CORE', label: '小九中枢', group: '系统' }
})

function go(path: string) {
  router.push(path)
}

// 分组折叠状态：默认全部展开；当前 active 所在组永远视为展开
const COLLAPSE_KEY = 'xiaojiu.rail.collapsed.v1'
const collapsed = ref<Set<string>>(new Set())

// 从 localStorage 恢复
try {
  const saved = localStorage.getItem(COLLAPSE_KEY)
  if (saved) {
    const arr = JSON.parse(saved) as string[]
    if (Array.isArray(arr)) collapsed.value = new Set(arr)
  }
} catch { /* noop */ }

// active 所在组自动展开
const activeGroupKey = computed(() => {
  for (const group of moduleGroups) {
    if (group.modules.some(m => m.name === route.name)) return group.key
  }
  return ''
})

watch(activeGroupKey, key => {
  if (key && collapsed.value.has(key)) {
    const next = new Set(collapsed.value)
    next.delete(key)
    collapsed.value = next
  }
})

function isCollapsed(key: string) {
  return key !== activeGroupKey.value && collapsed.value.has(key)
}

function toggleGroup(key: string) {
  // 当前 active 所在组不允许折叠（防止误把自己折掉）
  if (key === activeGroupKey.value) return
  const next = new Set(collapsed.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsed.value = next
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(next))) } catch { /* noop */ }
}
</script>

<template>
  <aside class="command-module-rail" aria-label="小九中枢模块启动器">
    <div class="rail-glow" />

    <header class="brand-block" title="小九中枢">
      <div class="brand-orb">
        <img src="/logo.png?v=xiaojiu-20260504" alt="小九" />
        <span class="brand-ring" />
      </div>
      <span class="brand-label">XIAOJIU</span>
      <span class="brand-sub">COMMAND CORE</span>
    </header>

    <div class="active-module-chip" :title="`${activeMeta.group} · ${activeMeta.label}`">
      <span class="pulse" />
      <strong>{{ activeMeta.short }}</strong>
    </div>

    <button
      type="button"
      class="home-entry"
      :class="{ active: route.name === homeEntry.name }"
      :title="homeEntry.label"
      :aria-label="homeEntry.label"
      @click="go(homeEntry.path)"
    >
      <span class="home-entry-glyph" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 10.5L12 4l8 6.5V20H4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 20v-5h6v5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
      </span>
      <span class="home-entry-code">{{ homeEntry.short }}</span>
      <span class="home-entry-label">{{ homeEntry.label }}</span>
    </button>

    <nav class="module-groups">
      <section
        v-for="group in moduleGroups"
        :key="group.key"
        class="module-group"
        :class="{ collapsed: isCollapsed(group.key), active: group.key === activeGroupKey }"
        :aria-label="group.title"
      >
        <button
          type="button"
          class="group-tag"
          :title="group.key === activeGroupKey ? `${group.title}（当前所在）` : (isCollapsed(group.key) ? `展开 ${group.title}` : `收起 ${group.title}`)"
          :aria-expanded="!isCollapsed(group.key)"
          @click="toggleGroup(group.key)"
        >
          <span class="group-caret" aria-hidden="true">{{ isCollapsed(group.key) ? '▸' : '▾' }}</span>
          <span class="group-tag-text">{{ group.title }}</span>
        </button>
        <div class="group-body" :hidden="isCollapsed(group.key)">
        <button
          v-for="item in group.modules"
          :key="item.name"
          class="module-entry"
          :class="{ active: route.name === item.name }"
          type="button"
          :title="item.label"
          :aria-label="item.label"
          @click="go(item.path)"
        >
          <span class="entry-glyph" aria-hidden="true">
            <!-- chat -->
            <svg v-if="item.icon === 'chat'" viewBox="0 0 24 24" width="18" height="18"><path d="M4 5h16v10H7l-3 3V5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
            <!-- history -->
            <svg v-else-if="item.icon === 'history'" viewBox="0 0 24 24" width="18" height="18"><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>
            <!-- home -->
            <svg v-else-if="item.icon === 'home'" viewBox="0 0 24 24" width="18" height="18"><path d="M4 10.5L12 4l8 6.5V20H4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 20v-5h6v5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
            <!-- group -->
            <svg v-else-if="item.icon === 'group'" viewBox="0 0 24 24" width="18" height="18"><circle cx="9" cy="10" r="3" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="17" cy="10" r="2.2" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M4 18c1-2.8 3-4 5-4s4 1.2 5 4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M14 18c.6-2 2-3 3-3s2 .6 2.8 2" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>
            <!-- radar -->
            <svg v-else-if="item.icon === 'radar'" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M12 12L18 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            <!-- jobs -->
            <svg v-else-if="item.icon === 'jobs'" viewBox="0 0 24 24" width="18" height="18"><rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
            <!-- usage -->
            <svg v-else-if="item.icon === 'usage'" viewBox="0 0 24 24" width="18" height="18"><path d="M4 18V8M9 18V11M14 18V6M19 18V13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            <!-- log -->
            <svg v-else-if="item.icon === 'log'" viewBox="0 0 24 24" width="18" height="18"><path d="M6 4h9l3 3v13H6z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/><path d="M9 11h6M9 15h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            <!-- memory -->
            <svg v-else-if="item.icon === 'memory'" viewBox="0 0 24 24" width="18" height="18"><path d="M7 7a4 4 0 018 0v10a4 4 0 01-8 0z" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M11 10l-2 2 2 2M13 10l2 2-2 2" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>
            <!-- files -->
            <svg v-else-if="item.icon === 'files'" viewBox="0 0 24 24" width="18" height="18"><path d="M5 5h7l2 2h5v12H5z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/></svg>
            <!-- skill -->
            <svg v-else-if="item.icon === 'skill'" viewBox="0 0 24 24" width="18" height="18"><path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/></svg>
            <!-- model -->
            <svg v-else-if="item.icon === 'model'" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="5" cy="6" r="1.6" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="19" cy="6" r="1.6" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="5" cy="18" r="1.6" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="19" cy="18" r="1.6" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M9.5 10.5L6 7M14.5 10.5L18 7M9.5 13.5L6 17M14.5 13.5L18 17" stroke="currentColor" stroke-width="1.2"/></svg>
            <!-- terminal -->
            <svg v-else-if="item.icon === 'terminal'" viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="5" width="18" height="14" rx="1.8" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M7 10l3 2-3 2M13 15h4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
            <!-- gateway -->
            <svg v-else-if="item.icon === 'gateway'" viewBox="0 0 24 24" width="18" height="18"><path d="M4 10h4v8H4zM16 10h4v8h-4z" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M8 14h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 4v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            <!-- channel -->
            <svg v-else-if="item.icon === 'channel'" viewBox="0 0 24 24" width="18" height="18"><path d="M4 10l16-5v14L4 14z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/></svg>
            <!-- profile -->
            <svg v-else-if="item.icon === 'profile'" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="9" r="3" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M5 19c1.4-3.4 4-5 7-5s5.6 1.6 7 5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>
            <!-- settings -->
            <svg v-else-if="item.icon === 'settings'" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          </span>
          <span class="entry-short">{{ item.short }}</span>
          <span class="entry-tooltip">{{ item.label }}</span>
        </button>
        </div>
      </section>
    </nav>
  </aside>
</template>

<style scoped lang="scss">
.command-module-rail {
  --xr-bg: #030712;
  --xr-line: rgba(99, 231, 255, 0.2);
  --xr-line-soft: rgba(255, 255, 255, 0.06);
  --xr-cyan: #63e7ff;
  --xr-blue: #4d8dff;
  --xr-violet: #a98cff;
  --xr-text: #edf7ff;
  --xr-soft: #b9c9de;
  --xr-muted: #7f90aa;

  position: relative;
  width: 92px;
  height: calc(100 * var(--vh));
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 8px 12px;
  overflow: visible;
  color: var(--xr-text);
  background:
    radial-gradient(circle at 50% 0%, rgba(99, 231, 255, 0.12), transparent 34%),
    linear-gradient(180deg, rgba(7, 16, 31, 0.96), rgba(3, 7, 18, 0.92));
  border-right: 1px solid var(--xr-line);
  box-shadow: 14px 0 42px rgba(0, 0, 0, 0.26), inset -1px 0 0 rgba(255, 255, 255, 0.03);
}

.rail-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(99, 231, 255, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99, 231, 255, 0.04) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: radial-gradient(circle at 50% 20%, black, transparent 78%);
}

.brand-block,
.active-module-chip,
.home-entry,
.module-groups {
  position: relative;
  z-index: 3;
}

.brand-block {
  display: grid;
  place-items: center;
  gap: 4px;
  padding: 2px 0 10px;
  border-bottom: 1px solid var(--xr-line-soft);
}

.brand-orb {
  position: relative;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(99, 231, 255, 0.22), rgba(169, 140, 255, 0.08));
  border: 1px solid rgba(99, 231, 255, 0.4);
  box-shadow: 0 0 20px rgba(99, 231, 255, 0.26), 0 0 48px rgba(77, 141, 255, 0.1);

  img {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    object-fit: cover;
  }
}

.brand-ring {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1px dashed rgba(99, 231, 255, 0.28);
  animation: brand-rotate 18s linear infinite;
}

@keyframes brand-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.brand-label {
  color: var(--xr-text);
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
}

.brand-sub {
  color: var(--xr-muted);
  font-family: 'Fira Code', monospace;
  font-size: 7.5px;
  letter-spacing: 0.2em;
}

.active-module-chip {
  display: grid;
  grid-auto-flow: column;
  place-items: center;
  gap: 6px;
  padding: 7px 4px;
  border: 1px solid rgba(99, 231, 255, 0.2);
  border-radius: 12px;
  background: rgba(99, 231, 255, 0.05);

  strong {
    color: var(--xr-cyan);
    font-family: 'Fira Code', monospace;
    font-size: 10.5px;
    font-weight: 650;
    letter-spacing: 0.1em;
  }
}

.home-entry {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 4px 12px;
  border-radius: 18px;
  border: 1px solid rgba(99, 231, 255, 0.18);
  background: linear-gradient(180deg, rgba(99, 231, 255, 0.12), rgba(77, 141, 255, 0.05));
  color: var(--xr-text);
  cursor: pointer;
  transition: border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;

  &:hover {
    border-color: rgba(99, 231, 255, 0.34);
    box-shadow: 0 0 20px rgba(99, 231, 255, 0.16);
    transform: translateY(-1px);
  }

  &.active {
    border-color: rgba(99, 231, 255, 0.46);
    background: linear-gradient(180deg, rgba(99, 231, 255, 0.18), rgba(77, 141, 255, 0.08));
    box-shadow: 0 0 24px rgba(99, 231, 255, 0.18), inset 0 0 24px rgba(99, 231, 255, 0.06);
  }
}

.home-entry-glyph {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: var(--xr-cyan);
  background: radial-gradient(circle, rgba(99, 231, 255, 0.18), rgba(169, 140, 255, 0.08));
  border: 1px solid rgba(99, 231, 255, 0.18);
}

.home-entry-code {
  color: var(--xr-text);
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.14em;
}

.home-entry-label {
  color: var(--xr-soft);
  font-size: 10px;
  letter-spacing: 0.1em;
}

.pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--xr-cyan);
  box-shadow: 0 0 12px var(--xr-cyan);
  animation: pulse-breathe 2.4s ease-in-out infinite;
}

@keyframes pulse-breathe {
  0%, 100% { opacity: 0.45; transform: scale(0.82); }
  50% { opacity: 1; transform: scale(1.12); }
}

.module-groups {
  flex: 1;
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 14px;
  overflow-y: auto;
  overflow-x: visible;
  padding: 2px 0 8px;

  &::-webkit-scrollbar { width: 0; }
}

.module-group {
  position: relative;
  display: grid;
  gap: 5px;
}

.module-group.collapsed {
  gap: 0;
}

.group-tag {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  padding: 8px 2px 2px;
  margin: 0 0 2px;
  color: var(--xr-muted);
  font-family: 'Fira Code', monospace;
  font-size: 8.5px;
  letter-spacing: 0.18em;
  text-align: center;
  opacity: 0.62;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--xr-line-soft);
  cursor: pointer;
  transition: color 0.18s ease, opacity 0.18s ease;
  user-select: none;
}

.group-tag:hover {
  color: var(--xr-cyan);
  opacity: 0.95;
}

.module-group.active .group-tag {
  color: var(--xr-cyan);
  opacity: 0.92;
  cursor: default;
}

.module-group.active .group-tag:hover {
  color: var(--xr-cyan);
}

.group-caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 10px;
  font-size: 9px;
  transform: translateY(-0.5px);
  transition: transform 0.18s ease;
}

.module-group.active .group-caret {
  opacity: 0.5;
}

.group-body {
  display: grid;
  gap: 5px;
  overflow: hidden;
  transition: opacity 0.2s ease;
}

.group-body[hidden] {
  display: none;
}

.module-group.collapsed .group-tag {
  padding-bottom: 6px;
  margin-bottom: 0;
}

.module-group:first-child .group-tag {
  border-top: 0;
  padding-top: 2px;
}

.module-entry {
  position: relative;
  display: grid;
  place-items: center;
  gap: 2px;
  width: 76px;
  padding: 8px 0 6px;
  border: 1px solid rgba(99, 231, 255, 0.1);
  border-radius: 12px;
  color: var(--xr-soft);
  background: rgba(4, 9, 20, 0.4);
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;

  &:hover,
  &:focus-visible {
    color: #fff;
    border-color: rgba(99, 231, 255, 0.4);
    background: rgba(99, 231, 255, 0.08);
    transform: translateX(2px);
    outline: none;

    .entry-tooltip {
      opacity: 1;
      transform: translate(8px, -50%);
      pointer-events: auto;
    }
  }

  &.active {
    color: #fff;
    border-color: rgba(99, 231, 255, 0.62);
    background: linear-gradient(145deg, rgba(99, 231, 255, 0.2), rgba(77, 141, 255, 0.07));
    box-shadow: 0 12px 34px rgba(99, 231, 255, 0.12), inset 0 0 0 1px rgba(255, 255, 255, 0.035);

    .entry-glyph { color: var(--xr-cyan); }
    .entry-short { color: #fff; }

    &::after {
      content: '';
      position: absolute;
      right: -9px;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 24px;
      border-radius: 999px;
      background: var(--xr-cyan);
      box-shadow: 0 0 16px var(--xr-cyan);
    }
  }
}

.entry-glyph {
  display: grid;
  place-items: center;
  color: var(--xr-cyan);
  opacity: 0.86;
  transition: opacity 0.2s ease;
}

.module-entry:hover .entry-glyph { opacity: 1; }

.entry-short {
  font-family: 'Fira Code', monospace;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--xr-soft);
}

.entry-tooltip {
  position: absolute;
  left: 100%;
  top: 50%;
  z-index: 20;
  min-width: max-content;
  padding: 7px 10px;
  border: 1px solid rgba(99, 231, 255, 0.22);
  border-radius: 10px;
  color: var(--xr-text);
  background: rgba(3, 8, 19, 0.94);
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.36), 0 0 24px rgba(99, 231, 255, 0.1);
  font-size: 11.5px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transform: translate(2px, -50%);
  transition: opacity 0.16s ease, transform 0.16s ease;
}

@media (max-width: 1180px) {
  .command-module-rail {
    width: 84px;
    padding: 12px 6px;
  }

  .module-entry { width: 70px; }
  .entry-short { font-size: 8.5px; }
}
</style>
