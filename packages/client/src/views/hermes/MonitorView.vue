<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton } from 'naive-ui'
import { useAppStore } from '@/stores/hermes/app'
import { useJobsStore } from '@/stores/hermes/jobs'
import { useUsageStore } from '@/stores/hermes/usage'
import { checkHealth, type HealthResponse } from '@/api/hermes/system'
import { fetchSkills, fetchMemory, type MemoryData, type SkillCategory, type SkillInfo } from '@/api/hermes/skills'

const { t } = useI18n()
const appStore = useAppStore()
const jobsStore = useJobsStore()
const usageStore = useUsageStore()

const loading = ref(false)
const health = ref<HealthResponse | null>(null)
const skills = ref<{ categories: SkillCategory[], archived: SkillInfo[] }>({ categories: [], archived: [] })
const memory = ref<MemoryData | null>(null)
const lastUpdated = ref('—')
const loadError = ref('')

const totalSkills = computed(() => skills.value.categories.reduce((sum: number, c: SkillCategory) => sum + c.skills.length, 0))
const enabledSkills = computed(() => skills.value.categories.reduce((sum: number, c: SkillCategory) => sum + c.skills.filter((s: SkillInfo) => s.enabled !== false).length, 0))
const skillCategoryCount = computed(() => skills.value.categories.length)
const totalModels = computed(() => appStore.modelGroups.reduce((sum, g) => sum + g.models.length, 0))
const runningJobs = computed(() => jobsStore.jobs.filter(j => j.enabled && !j.paused_at).length)
const pausedJobs = computed(() => jobsStore.jobs.filter(j => !j.enabled || j.paused_at).length)
const failedJobs = computed(() => jobsStore.jobs.filter(j => j.last_status === 'failed' || !!j.last_error).length)
const queuedJobs = computed(() => Math.max(jobsStore.jobs.length - runningJobs.value - pausedJobs.value, 0))

// Task health as a single percentage for the arc
const taskHealth = computed(() => {
  if (!jobsStore.jobs.length) return 100
  return Math.round(((jobsStore.jobs.length - failedJobs.value) / jobsStore.jobs.length) * 100)
})

// Arc stroke-dasharray for the health ring (circumference ≈ 2π × 42 ≈ 264)
const HEALTH_CIRCUMFERENCE = 264
const healthArc = computed(() => {
  const pct = taskHealth.value / 100
  const dash = pct * HEALTH_CIRCUMFERENCE
  const gap = HEALTH_CIRCUMFERENCE - dash
  return `${dash} ${gap}`
})

// Health color: green → yellow → red
const healthColor = computed(() => {
  if (taskHealth.value >= 80) return '#6ee7b7'
  if (taskHealth.value >= 50) return '#fcd34d'
  return '#f87171'
})

const coreStatus = computed(() => appStore.connected ? 'ONLINE' : 'OFFLINE')
const modelLabel = computed(() => appStore.selectedModel || '—')
const healthySubsystems = computed(() => subsystems.value.filter(i => i.tone === 'good').length)

// --- Activity stream: true area chart data ---
const activityDays = computed(() => {
  const days = usageStore.dailyUsage.slice(-30)
  if (!days.length) return []
  const maxVal = Math.max(...days.map(d => d.sessions + d.errors), 1)
  return days.map((d, i) => {
    const x = days.length <= 1 ? 50 : (i / (days.length - 1)) * 100
    const y = 100 - Math.min(((d.sessions + d.errors) / maxVal) * 100, 100)
    return {
      x,
      y,
      label: d.date.slice(5),
      status: d.errors > 0 ? 'warn' : d.sessions > 0 ? 'live' : 'idle',
      sessions: d.sessions,
    }
  })
})

// SVG path for the area chart
const areaPath = computed(() => {
  const pts = activityDays.value
  if (!pts.length) return ''
  const bottom = 100
  const pathParts = pts.map((p, i) => {
    const cmd = i === 0 ? 'M' : 'L'
    return `${cmd} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
  })
  const last = pts[pts.length - 1]
  const first = pts[0]
  return `${pathParts.join(' ')} L ${last.x.toFixed(1)} ${bottom} L ${first.x.toFixed(1)} ${bottom} Z`
})

const linePath = computed(() => {
  const pts = activityDays.value
  if (!pts.length) return ''
  return pts.map((p, i) => {
    const cmd = i === 0 ? 'M' : 'L'
    return `${cmd} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
  }).join(' ')
})

// Tick marks for the activity chart
const chartTicks = computed(() => {
  const days = activityDays.value
  if (!days.length) return []
  // Show first, middle, last
  const indices = [0, Math.floor(days.length / 2), days.length - 1]
  return indices.map(i => days[i]).filter(Boolean)
})

// --- Token data ---
const topModels = computed(() => usageStore.modelUsage.slice(0, 3))

// --- Subsystems ---
const subsystems = computed(() => [
  { name: 'Gateway', value: health.value?.status === 'ok' ? 'online' : 'checking', tone: health.value?.status === 'ok' ? 'good' : 'warn' as 'good' | 'warn' | 'bad' },
  { name: 'BFF', value: appStore.connected ? 'linked' : 'offline', tone: appStore.connected ? 'good' : 'bad' as 'good' | 'warn' | 'bad' },
  { name: 'Models', value: `${totalModels.value}`, tone: totalModels.value ? 'good' : 'warn' as 'good' | 'warn' | 'bad' },
  { name: 'Jobs', value: `${runningJobs.value} act`, tone: failedJobs.value ? 'bad' as 'good' | 'warn' | 'bad' : 'good' },
  { name: 'Memory', value: memory.value ? 'indexed' : 'pending', tone: memory.value ? 'good' : 'warn' as 'good' | 'warn' | 'bad' },
  { name: 'Skills', value: `${enabledSkills.value}/${totalSkills.value}`, tone: totalSkills.value ? 'good' : 'warn' as 'good' | 'warn' | 'bad' },
])

// --- Alert strip ---
const alerts = computed(() => {
  const items: Array<{ title: string; detail: string; tone: 'bad' | 'warn' }> = []
  if (!appStore.connected) items.push({ title: '连接断开', detail: 'BFF 与 Gateway 当前未建立稳定连接', tone: 'bad' })
  if (failedJobs.value > 0) items.push({ title: '任务异常', detail: `${failedJobs.value} 个任务最近失败或留下错误痕迹`, tone: 'bad' })
  if (!memory.value) items.push({ title: '记忆未就绪', detail: 'memory / user / soul 监控源暂未返回状态', tone: 'warn' })
  if (!usageStore.hasData) items.push({ title: '用量待采集', detail: '暂无有效 token / session 数据', tone: 'warn' })
  return items
})

const hasAlerts = computed(() => alerts.value.length > 0)

function formatVersion() {
  return appStore.serverVersion || health.value?.webui_version || '0.1.0'
}

function formatTokens(value: number) {
  if (!value) return '0'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(Math.round(value))
}

function formatCost(value: number) {
  if (!value) return '$0.00'
  return `$${value.toFixed(2)}`
}

async function refreshMonitor() {
  loading.value = true
  loadError.value = ''
  try {
    const [healthRes, skillRes, memoryRes, jobsRes, modelsRes, connectionRes, usageRes] = await Promise.allSettled([
      checkHealth(),
      fetchSkills(),
      fetchMemory(),
      jobsStore.fetchJobs(),
      appStore.loadModels(),
      appStore.checkConnection(),
      usageStore.loadSessions(),
    ])

    if (healthRes.status === 'fulfilled') health.value = healthRes.value
    if (skillRes.status === 'fulfilled') skills.value = skillRes.value
    if (memoryRes.status === 'fulfilled') memory.value = memoryRes.value

    const failed = [healthRes, skillRes, memoryRes, jobsRes, modelsRes, connectionRes, usageRes].filter(r => r.status === 'rejected').length
    if (failed) loadError.value = `${failed} 个监控源暂时不可用`

    lastUpdated.value = new Date().toLocaleTimeString()
  } finally {
    loading.value = false
  }
}

onMounted(refreshMonitor)
</script>

<template>
  <section class="command-view" aria-labelledby="monitor-title">

    <!-- ─── Top Status Strip ─── -->
    <header class="status-strip">
      <div class="strip-left">
        <span class="strip-kicker">XIAOJIU COMMAND</span>
        <h1 id="monitor-title" class="strip-title">中枢总览</h1>
        <span class="strip-version">v{{ formatVersion() }}</span>
      </div>

      <div class="strip-metrics">
        <div class="strip-metric">
          <span class="strip-metric-label">CORE</span>
          <span class="strip-metric-value" :class="appStore.connected ? 'good' : 'bad'">{{ coreStatus }}</span>
        </div>
        <div class="strip-divider" />
        <div class="strip-metric">
          <span class="strip-metric-label">MODEL</span>
          <span class="strip-metric-value">{{ modelLabel }}</span>
        </div>
        <div class="strip-divider" />
        <div class="strip-metric">
          <span class="strip-metric-label">TASKS</span>
          <span class="strip-metric-value">
            <span class="val-green">{{ runningJobs }}</span>
            <span class="val-sep">/</span>
            <span class="val-dim">{{ pausedJobs }}</span>
            <span class="val-sep">/</span>
            <span class="val-red" v-if="failedJobs">{{ failedJobs }}</span>
          </span>
        </div>
        <div class="strip-divider" />
        <div class="strip-metric">
          <span class="strip-metric-label">TOKEN</span>
          <span class="strip-metric-value">{{ formatTokens(usageStore.totalTokens) }}</span>
        </div>
        <div class="strip-divider" />
        <div class="strip-metric">
          <span class="strip-metric-label">COST</span>
          <span class="strip-metric-value">{{ formatCost(usageStore.estimatedCost) }}</span>
        </div>
      </div>

      <div class="strip-actions">
        <div class="heartbeat-pill" :class="{ online: appStore.connected }">
          <span class="pulse-dot" />
          <span>{{ appStore.connected ? 'LIVE' : 'OFFLINE' }}</span>
        </div>
        <NButton size="tiny" secondary :loading="loading" @click="refreshMonitor">
          {{ t('monitor.refresh') }}
        </NButton>
      </div>
    </header>

    <!-- ─── Hero Area ─── -->
    <section class="hero-area">

      <!-- Left: Health Ring -->
      <article class="panel-shell ring-panel">
        <div class="panel-label">SYSTEM HEALTH</div>

        <div class="ring-stage">
          <!-- Outer ring segments -->
          <svg class="ring-svg" viewBox="0 0 120 120" aria-hidden="true">
            <!-- Background track -->
            <circle cx="60" cy="60" r="42" fill="none" stroke="rgba(99,231,255,0.07)" stroke-width="8" />
            <!-- Health arc -->
            <circle
              cx="60" cy="60" r="42"
              fill="none"
              :stroke="healthColor"
              stroke-width="8"
              stroke-linecap="round"
              :stroke-dasharray="healthArc"
              transform="rotate(-90 60 60)"
              class="health-arc"
            />
            <!-- Tick marks -->
            <g class="ring-ticks">
              <line x1="60" y1="14" x2="60" y2="20" stroke="rgba(99,231,255,0.3)" stroke-width="1.5" />
              <line x1="106" y1="60" x2="100" y2="60" stroke="rgba(99,231,255,0.3)" stroke-width="1.5" />
              <line x1="60" y1="106" x2="60" y2="100" stroke="rgba(99,231,255,0.3)" stroke-width="1.5" />
              <line x1="14" y1="60" x2="20" y2="60" stroke="rgba(99,231,255,0.3)" stroke-width="1.5" />
            </g>
          </svg>

          <div class="ring-core">
            <span class="ring-pct" :style="{ color: healthColor }">{{ taskHealth }}%</span>
            <span class="ring-label">HEALTH</span>
          </div>
        </div>

        <div class="ring-stats">
          <div class="ring-stat">
            <span class="ring-stat-dot run" />
            <span>RUN</span>
            <strong>{{ runningJobs }}</strong>
          </div>
          <div class="ring-stat">
            <span class="ring-stat-dot pause" />
            <span>PAUSE</span>
            <strong>{{ pausedJobs }}</strong>
          </div>
          <div class="ring-stat">
            <span class="ring-stat-dot alert" />
            <span>ALERT</span>
            <strong>{{ failedJobs }}</strong>
          </div>
          <div class="ring-stat">
            <span class="ring-stat-dot queue" />
            <span>QUEUE</span>
            <strong>{{ queuedJobs }}</strong>
          </div>
        </div>
      </article>

      <!-- Right: Activity Stream -->
      <article class="panel-shell stream-panel">
        <div class="panel-label">ACTIVITY STREAM · 30d</div>

        <div class="stream-chart-shell">
          <svg class="stream-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#63e7ff" stop-opacity="0.22" />
                <stop offset="100%" stop-color="#63e7ff" stop-opacity="0.01" />
              </linearGradient>
              <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#63e7ff" />
                <stop offset="60%" stop-color="#7dd3fc" />
                <stop offset="100%" stop-color="#a98cff" />
              </linearGradient>
            </defs>

            <!-- Grid lines -->
            <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(99,231,255,0.06)" stroke-width="0.5" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(99,231,255,0.06)" stroke-width="0.5" />
            <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(99,231,255,0.06)" stroke-width="0.5" />

            <!-- Area fill -->
            <path v-if="areaPath" :d="areaPath" fill="url(#areaGrad)" />
            <!-- Line -->
            <path v-if="linePath" :d="linePath" fill="none" stroke="url(#lineGrad)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>

          <!-- Tick labels -->
          <div class="stream-ticks">
            <span v-for="tick in chartTicks" :key="tick.label">{{ tick.label }}</span>
          </div>
        </div>

        <div class="stream-meta-row">
          <div class="stream-meta-item">
            <span class="meta-label">SESSIONS</span>
            <strong>{{ usageStore.totalSessions }}</strong>
          </div>
          <div class="stream-meta-item">
            <span class="meta-label">INPUT</span>
            <strong>{{ formatTokens(usageStore.totalInputTokens) }}</strong>
          </div>
          <div class="stream-meta-item">
            <span class="meta-label">OUTPUT</span>
            <strong>{{ formatTokens(usageStore.totalOutputTokens) }}</strong>
          </div>
          <div class="stream-meta-item">
            <span class="meta-label">CACHE</span>
            <strong>{{ formatTokens(usageStore.totalCacheTokens) }}</strong>
          </div>
        </div>
      </article>

    </section>

    <!-- ─── Signal Panels ─── -->
    <section class="signal-panels">

      <article class="panel-shell signal-card">
        <div class="signal-header">
          <span class="signal-kicker">TOKEN</span>
          <span class="signal-title">用量总览</span>
        </div>
        <div class="signal-big-num">{{ formatTokens(usageStore.totalTokens) }}</div>
        <div class="signal-rows">
          <div class="signal-row">
            <span>Input</span>
            <strong>{{ formatTokens(usageStore.totalInputTokens) }}</strong>
          </div>
          <div class="signal-row">
            <span>Output</span>
            <strong>{{ formatTokens(usageStore.totalOutputTokens) }}</strong>
          </div>
          <div class="signal-row">
            <span>Cost</span>
            <strong>{{ formatCost(usageStore.estimatedCost) }}</strong>
          </div>
          <div class="signal-row">
            <span>Cache Hit</span>
            <strong>{{ usageStore.cacheHitRate == null ? '—' : `${usageStore.cacheHitRate.toFixed(1)}%` }}</strong>
          </div>
        </div>
      </article>

      <article class="panel-shell signal-card">
        <div class="signal-header">
          <span class="signal-kicker">SYSTEMS</span>
          <span class="signal-title">子系统状态</span>
          <span class="signal-badge" :class="healthySubsystems === subsystems.length ? 'good' : 'warn'">
            {{ healthySubsystems }}/{{ subsystems.length }}
          </span>
        </div>
        <div class="subsystem-rows">
          <div v-for="item in subsystems" :key="item.name" class="sub-row" :class="item.tone">
            <span class="sub-dot" />
            <span class="sub-name">{{ item.name }}</span>
            <span class="sub-val">{{ item.value }}</span>
          </div>
        </div>
      </article>

      <article class="panel-shell signal-card">
        <div class="signal-header">
          <span class="signal-kicker">MODELS &amp; SKILLS</span>
          <span class="signal-title">模型与技能</span>
        </div>
        <div class="model-rows">
          <div v-for="item in topModels" :key="item.model" class="model-row">
            <span class="model-name">{{ item.model }}</span>
            <span class="model-tokens">{{ formatTokens(item.totalTokens) }}</span>
          </div>
          <div v-if="!topModels.length" class="empty-hint">暂无模型用量数据</div>
        </div>
        <div class="skill-pills">
          <div class="skill-pill">
            <span class="skill-pill-label">Skills</span>
            <span class="skill-pill-val">{{ enabledSkills }}/{{ totalSkills }}</span>
          </div>
          <div class="skill-pill">
            <span class="skill-pill-label">Groups</span>
            <span class="skill-pill-val">{{ skillCategoryCount }}</span>
          </div>
          <div class="skill-pill">
            <span class="skill-pill-label">Models</span>
            <span class="skill-pill-val">{{ totalModels }}</span>
          </div>
        </div>
      </article>

    </section>

    <!-- ─── Alert Strip ─── -->
    <div v-if="hasAlerts" class="alert-strip">
      <div v-for="alert in alerts" :key="alert.title" class="alert-item" :class="alert.tone">
        <span class="alert-dot" />
        <strong>{{ alert.title }}</strong>
        <span>{{ alert.detail }}</span>
      </div>
    </div>

    <div v-if="loadError" class="load-error">{{ loadError }}</div>

  </section>
</template>

<style scoped lang="scss">
// ─── Variables ───────────────────────────────────────────
$bg-base: #02040b;
$bg-panel: rgba(6, 14, 28, 0.92);
$border: rgba(99, 231, 255, 0.1);
$border-bright: rgba(99, 231, 255, 0.22);
$cyan: #63e7ff;
$green: #6ee7b7;
$yellow: #fcd34d;
$red: #f87171;
$purple: #a98cff;
$text-primary: #edf7ff;
$text-secondary: #7f90aa;
$text-dim: #4a5568;
$radius: 24px;

// ─── Base ────────────────────────────────────────────────
.command-view {
  min-height: calc(100 * var(--vh));
  padding: 20px 24px 28px;
  background:
    radial-gradient(circle at 8% 6%, rgba(56, 189, 248, 0.09), transparent 30%),
    radial-gradient(circle at 92% 14%, rgba(34, 197, 94, 0.07), transparent 26%),
    linear-gradient(148deg, #020810 0%, #050e1e 55%, #02040b 100%);
  color: $text-primary;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden auto;
}

// ─── Panel Shell ─────────────────────────────────────────
.panel-shell {
  background: $bg-panel;
  border: 1px solid $border;
  border-radius: $radius;
  backdrop-filter: blur(20px);
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    left: 20px;
    right: 20px;
    top: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(99,231,255,0.22), transparent);
    pointer-events: none;
  }
}

.panel-label {
  color: $cyan;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  padding: 16px 20px 0;
}

// ─── Top Status Strip ────────────────────────────────────
.status-strip {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 14px 20px;
  background: $bg-panel;
  border: 1px solid $border;
  border-radius: $radius;
  backdrop-filter: blur(20px);
  flex-wrap: wrap;

  &::after {
    content: '';
    position: absolute;
    left: 20px;
    right: 20px;
    top: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(99,231,255,0.22), transparent);
    pointer-events: none;
  }
}

.strip-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.strip-kicker {
  color: $cyan;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  letter-spacing: 0.2em;
}

.strip-title {
  font-size: 18px;
  font-weight: 640;
  color: $text-primary;
  margin: 0;
  letter-spacing: -0.02em;
}

.strip-version {
  color: $text-secondary;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  opacity: 0.6;
}

.strip-metrics {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 1;
  justify-content: center;
  flex-wrap: wrap;
}

.strip-metric {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 14px;
}

.strip-metric-label {
  color: $text-dim;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  letter-spacing: 0.16em;
}

.strip-metric-value {
  font-family: 'Fira Code', monospace;
  font-size: 12px;
  color: $text-primary;
  display: flex;
  align-items: center;
  gap: 4px;

  &.good { color: $green; }
  &.bad { color: $red; }
}

.val-sep { color: $text-dim; }
.val-dim { color: $text-secondary; }
.val-green { color: $green; }
.val-red { color: $red; }

.strip-divider {
  width: 1px;
  height: 16px;
  background: rgba(255,255,255,0.06);
  flex-shrink: 0;
}

.strip-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.heartbeat-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(99,231,255,0.14);
  background: rgba(4,10,21,0.6);
  color: $text-secondary;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  letter-spacing: 0.1em;

  &.online {
    border-color: rgba(110,231,183,0.3);
    color: $green;
  }
}

.pulse-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: $text-dim;
}

.heartbeat-pill.online .pulse-dot {
  background: $green;
  box-shadow: 0 0 10px rgba($green, 0.9);
}

// ─── Hero Area ───────────────────────────────────────────
.hero-area {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  min-height: 0;
}

.ring-panel {
  display: flex;
  flex-direction: column;
}

.ring-stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  min-height: 180px;
}

.ring-svg {
  width: 200px;
  height: 200px;
  position: absolute;
}

.health-arc {
  transition: stroke-dasharray 600ms ease, stroke 400ms ease;
}

.ring-core {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  gap: 2px;
  text-align: center;
}

.ring-pct {
  font-size: 38px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1;
  transition: color 400ms ease;
}

.ring-label {
  color: $text-secondary;
  font-family: 'Fira Code', monospace;
  font-size: 9px;
  letter-spacing: 0.2em;
}

.ring-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 0 16px 16px;
}

.ring-stat {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  border-radius: 14px;
  background: rgba(4,10,21,0.5);
  border: 1px solid rgba(255,255,255,0.04);
  font-size: 11px;
  color: $text-secondary;

  strong {
    margin-left: auto;
    font-size: 14px;
    color: $text-primary;
  }
}

.ring-stat-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;

  &.run { background: $cyan; }
  &.pause { background: $purple; }
  &.alert { background: $red; }
  &.queue { background: $text-dim; }
}

.stream-panel {
  display: flex;
  flex-direction: column;
}

.stream-chart-shell {
  flex: 1;
  position: relative;
  min-height: 180px;
  padding: 8px 16px 0;
}

.stream-svg {
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 8px 16px 36px;
}

.stream-ticks {
  position: absolute;
  bottom: 8px;
  left: 16px;
  right: 16px;
  display: flex;
  justify-content: space-between;
  font-family: 'Fira Code', monospace;
  font-size: 9px;
  color: $text-dim;
}

.stream-meta-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 12px 16px 16px;
}

.stream-meta-item {
  display: grid;
  gap: 3px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(4,10,21,0.5);
  border: 1px solid rgba(255,255,255,0.04);

  .meta-label {
    color: $text-dim;
    font-family: 'Fira Code', monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
  }

  strong {
    font-size: 14px;
    color: $text-primary;
  }
}

// ─── Signal Panels ────────────────────────────────────────
.signal-panels {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.signal-card {
  padding: 18px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.signal-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.signal-kicker {
  color: $cyan;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  letter-spacing: 0.2em;
}

.signal-title {
  font-size: 15px;
  font-weight: 600;
  color: $text-primary;
}

.signal-badge {
  margin-left: auto;
  padding: 3px 10px;
  border-radius: 999px;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  border: 1px solid;
  background: rgba(4,10,21,0.5);

  &.good {
    color: $green;
    border-color: rgba($green, 0.3);
  }
  &.warn {
    color: $yellow;
    border-color: rgba($yellow, 0.3);
  }
}

.signal-big-num {
  font-size: 36px;
  font-weight: 700;
  color: $text-primary;
  letter-spacing: -0.03em;
  line-height: 1;
}

.signal-rows {
  display: grid;
  gap: 6px;
}

.signal-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 10px;
  border-radius: 10px;
  background: rgba(4,10,21,0.45);
  border: 1px solid rgba(255,255,255,0.03);
  font-size: 12px;

  span { color: $text-secondary; }
  strong { color: $text-primary; font-weight: 500; }
}

.subsystem-rows {
  display: grid;
  gap: 6px;
}

.sub-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 10px;
  background: rgba(4,10,21,0.45);
  border: 1px solid rgba(255,255,255,0.03);
  font-size: 12px;

  &.good .sub-dot { background: $green; box-shadow: 0 0 8px rgba($green, 0.9); }
  &.warn .sub-dot { background: $yellow; box-shadow: 0 0 8px rgba($yellow, 0.9); }
  &.bad .sub-dot { background: $red; box-shadow: 0 0 8px rgba($red, 0.9); }
}

.sub-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: $text-dim;
}

.sub-name {
  color: $text-primary;
  font-size: 12px;
  flex: 1;
}

.sub-val {
  color: $text-secondary;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
}

.model-rows {
  display: grid;
  gap: 6px;
}

.model-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 10px;
  border-radius: 10px;
  background: rgba(4,10,21,0.45);
  border: 1px solid rgba(255,255,255,0.03);
}

.model-name {
  color: #cbe5ff;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
}

.model-tokens {
  color: $text-secondary;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
}

.empty-hint {
  color: $text-dim;
  font-size: 12px;
  text-align: center;
  padding: 16px 0;
}

.skill-pills {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: auto;
}

.skill-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(4,10,21,0.5);
  border: 1px solid rgba(255,255,255,0.05);
}

.skill-pill-label {
  color: $text-secondary;
  font-size: 10px;
}

.skill-pill-val {
  color: $text-primary;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
}

// ─── Alert Strip ─────────────────────────────────────────
.alert-strip {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.alert-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 14px;
  border-radius: 16px;
  background: rgba(4,10,21,0.7);
  border: 1px solid;
  font-size: 12px;
  flex: 1;
  min-width: 220px;

  &.bad {
    border-color: rgba($red, 0.28);
    background: rgba($red, 0.06);
  }

  &.warn {
    border-color: rgba($yellow, 0.24);
    background: rgba($yellow, 0.05);
  }

  strong { color: $text-primary; font-weight: 500; }
  span:last-child { color: $text-secondary; flex: 1; }
}

.alert-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;

  .bad & { background: $red; box-shadow: 0 0 8px rgba($red, 0.9); }
  .warn & { background: $yellow; box-shadow: 0 0 8px rgba($yellow, 0.9); }
}

.load-error {
  padding: 10px 14px;
  border-radius: 14px;
  border: 1px solid rgba($yellow, 0.22);
  background: rgba($yellow, 0.06);
  color: $yellow;
  font-size: 12px;
}

// ─── Hover ───────────────────────────────────────────────
.signal-card,
.ring-panel,
.stream-panel {
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 28px 52px rgba(0,0,0,0.28);
    border-color: $border-bright;
  }
}

.ring-stat,
.sub-row,
.model-row,
.signal-row,
.stream-meta-item {
  transition: background 140ms ease, border-color 140ms ease;
}

.ring-stat:hover { background: rgba(6,14,26,0.82) !important; }
.sub-row:hover { background: rgba(6,14,26,0.82) !important; border-color: rgba(99,231,255,0.12) !important; }
.model-row:hover { background: rgba(6,14,26,0.82) !important; }
.signal-row:hover { background: rgba(6,14,26,0.82) !important; }

// ─── Responsive ──────────────────────────────────────────
@media (max-width: 1100px) {
  .hero-area {
    grid-template-columns: 1fr;
  }

  .ring-stage {
    min-height: 160px;
  }

  .signal-panels {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 680px) {
  .command-view {
    padding: 14px;
    gap: 12px;
  }

  .status-strip {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .strip-metrics {
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 0;
  }

  .strip-actions {
    margin-left: 0;
  }

  .signal-panels {
    grid-template-columns: 1fr;
  }

  .stream-meta-row {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
