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

const totalSkills = computed(() => skills.value.categories.reduce((sum: number, category: SkillCategory) => sum + category.skills.length, 0))
const enabledSkills = computed(() => skills.value.categories.reduce((sum: number, category: SkillCategory) => sum + category.skills.filter((skill: SkillInfo) => skill.enabled !== false).length, 0))
const skillCategoryCount = computed(() => skills.value.categories.length)
const totalModels = computed(() => appStore.modelGroups.reduce((sum, group) => sum + group.models.length, 0))
const runningJobs = computed(() => jobsStore.jobs.filter(job => job.enabled && !job.paused_at).length)
const pausedJobs = computed(() => jobsStore.jobs.filter(job => !job.enabled || job.paused_at).length)
const failedJobs = computed(() => jobsStore.jobs.filter(job => job.last_status === 'failed' || !!job.last_error).length)
const queuedJobs = computed(() => Math.max(jobsStore.jobs.length - runningJobs.value - pausedJobs.value, 0))
const taskHealthScore = computed(() => {
  const total = jobsStore.jobs.length || 1
  const healthy = Math.max(total - failedJobs.value, 0)
  return Math.round((healthy / total) * 100)
})

const coreStatus = computed(() => appStore.connected ? 'ONLINE' : 'OFFLINE')
const modelLabel = computed(() => appStore.selectedModel || '—')
const providerLabel = computed(() => {
  const model = appStore.selectedModel
  if (!model) return '—'
  const group = appStore.modelGroups.find(group => group.models.some(item => item === model))
  return group?.provider || '—'
})

const memoryUpdated = computed(() => {
  const times = [memory.value?.memory_mtime, memory.value?.user_mtime, memory.value?.soul_mtime].filter(Boolean) as number[]
  if (!times.length) return '—'
  return new Date(Math.max(...times) * 1000).toLocaleString()
})

const healthySubsystems = computed(() => subsystems.value.filter(item => item.tone === 'good').length)
const topModel = computed(() => usageStore.modelUsage[0])
const topModels = computed(() => usageStore.modelUsage.slice(0, 3))
const tokenPulse = computed(() => {
  const daily = usageStore.dailyUsage.slice(-7)
  if (!daily.length) return []
  const values = daily.map(day => day.input_tokens + day.output_tokens)
  const max = Math.max(...values, 1)
  return daily.map((day, index) => ({
    id: `${day.date}-${index}`,
    label: day.date.slice(5),
    value: day.input_tokens + day.output_tokens,
    height: Math.max(28, Math.round(((day.input_tokens + day.output_tokens) / max) * 112)),
  }))
})

const activityBars = computed(() => {
  const daily = usageStore.dailyUsage.slice(-12)
  if (!daily.length) {
    return Array.from({ length: 12 }, (_, index) => ({ id: `empty-${index}`, height: 28 + (index % 4) * 10, status: 'idle', label: `${index + 1}` }))
  }

  const max = Math.max(...daily.map(day => day.sessions + day.errors), 1)
  return daily.map((day, index) => ({
    id: `${day.date}-${index}`,
    height: Math.max(20, Math.round(((day.sessions + day.errors) / max) * 116)),
    status: day.errors > 0 ? 'warn' : day.sessions > 0 ? 'live' : 'idle',
    label: day.date.slice(5),
  }))
})

const activitySignal = computed(() => {
  const bars = activityBars.value
  return bars.map((bar, index) => ({
    id: `signal-${bar.id}`,
    x: `${(index / Math.max(bars.length - 1, 1)) * 100}%`,
    y: `${100 - Math.min(bar.height, 116) / 1.28}%`,
  }))
})

const events = computed(() => [
  { title: '任务调度', value: `${runningJobs.value} 运行中 / ${pausedJobs.value} 暂停`, meta: `${failedJobs.value} 异常 · 健康 ${taskHealthScore.value}%`, tone: failedJobs.value ? 'bad' : 'good' },
  { title: '模型供应', value: `${totalModels.value} 个模型就绪`, meta: providerLabel.value, tone: totalModels.value ? 'good' : 'warn' },
  { title: '记忆索引', value: memory.value ? '记忆已接入' : '记忆待同步', meta: memoryUpdated.value, tone: memory.value ? 'good' : 'warn' },
  { title: 'Token 脉冲', value: formatTokens(usageStore.totalTokens), meta: `${usageStore.totalSessions} 会话 · ${formatCost(usageStore.estimatedCost)}`, tone: usageStore.hasData ? 'good' : 'idle' },
])

const alerts = computed(() => {
  const items: Array<{ title: string; detail: string; tone: 'bad' | 'warn' | 'good' }> = []

  if (!appStore.connected) {
    items.push({ title: '连接断开', detail: 'BFF 与 Gateway 当前未建立稳定连接', tone: 'bad' })
  }

  if (failedJobs.value > 0) {
    items.push({ title: '任务异常', detail: `${failedJobs.value} 个任务最近失败或留下错误痕迹`, tone: 'bad' })
  }

  if (!memory.value) {
    items.push({ title: '记忆未就绪', detail: 'memory / user / soul 监控源暂未返回状态', tone: 'warn' })
  }

  if (!usageStore.hasData) {
    items.push({ title: '用量待采集', detail: '暂无有效 token / session 数据，首页已保留占位', tone: 'warn' })
  }

  if (!items.length) {
    items.push({ title: '系统平稳', detail: '当前未检测到阻断级异常，Hermes 处于可用状态', tone: 'good' })
  }

  return items
})

const subsystems = computed(() => [
  { name: 'Gateway', value: health.value?.status === 'ok' ? 'online' : 'checking', tone: health.value?.status === 'ok' ? 'good' : 'warn' },
  { name: 'BFF', value: appStore.connected ? 'linked' : 'offline', tone: appStore.connected ? 'good' : 'bad' },
  { name: 'Models', value: `${totalModels.value} loaded`, tone: totalModels.value ? 'good' : 'warn' },
  { name: 'Jobs', value: `${runningJobs.value} active`, tone: failedJobs.value ? 'bad' : 'good' },
  { name: 'Memory', value: memory.value ? 'indexed' : 'pending', tone: memory.value ? 'good' : 'warn' },
  { name: 'Skills', value: `${enabledSkills.value}/${totalSkills.value}`, tone: totalSkills.value ? 'good' : 'warn' },
])

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

    const failed = [healthRes, skillRes, memoryRes, jobsRes, modelsRes, connectionRes, usageRes].filter(result => result.status === 'rejected').length
    if (failed) loadError.value = `${failed} 个监控源暂时不可用`

    lastUpdated.value = new Date().toLocaleTimeString()
  } finally {
    loading.value = false
  }
}

onMounted(refreshMonitor)
</script>

<template>
  <section class="monitor-view" aria-labelledby="monitor-title">
    <div class="monitor-grid-bg" />
    <div class="noise-overlay" />

    <header class="home-header panel-shell">
      <div class="header-copy">
        <p class="home-kicker">XIAOJIU COMMAND HOME</p>
        <div class="title-line">
          <h1 id="monitor-title">中枢总览</h1>
          <span class="title-badge">LIVE COMMAND SURFACE</span>
        </div>
        <p class="home-summary">这里不是普通监控页，是 Hermes 当前运行态的总台。任务流、token 脉冲、模型与记忆健康，统一从这里先看局势。</p>
        <div class="header-frequency">
          <span v-for="index in 18" :key="`freq-${index}`" :style="{ height: `${14 + (index % 6) * 7}px` }" />
        </div>
      </div>
      <div class="header-actions">
        <div class="heartbeat" :class="{ online: appStore.connected }">
          <span class="pulse-dot" />
          <span>{{ coreStatus }}</span>
        </div>
        <NButton size="small" secondary :loading="loading" @click="refreshMonitor">
          {{ t('monitor.refresh') }}
        </NButton>
      </div>
    </header>

    <section class="status-spine panel-shell">
      <div class="spine-cell primary">
        <span class="spine-label">CORE</span>
        <strong>{{ coreStatus }}</strong>
        <small>Hermes heartbeat</small>
      </div>
      <div class="spine-cell">
        <span class="spine-label">MODEL</span>
        <strong>{{ modelLabel }}</strong>
        <small>{{ providerLabel }}</small>
      </div>
      <div class="spine-cell emphasis">
        <span class="spine-label">TASK FLOW</span>
        <strong>{{ runningJobs }}</strong>
        <small>{{ pausedJobs }} paused · {{ failedJobs }} alert</small>
      </div>
      <div class="spine-cell accent">
        <span class="spine-label">TOKEN</span>
        <strong>{{ formatTokens(usageStore.totalTokens) }}</strong>
        <small>{{ formatCost(usageStore.estimatedCost) }} / {{ usageStore.totalSessions }} sessions</small>
      </div>
      <div class="spine-cell">
        <span class="spine-label">LAST PULSE</span>
        <strong>{{ lastUpdated }}</strong>
        <small>v{{ formatVersion() }}</small>
      </div>
    </section>

    <div v-if="loadError" class="monitor-warning">{{ loadError }}</div>

    <section class="hero-grid">
      <article class="panel-shell radar-panel">
        <div class="panel-head overlay-head">
          <div>
            <p class="panel-kicker">MISSION RADAR</p>
            <h2>任务雷达</h2>
          </div>
          <span class="panel-side">{{ runningJobs }} LIVE</span>
        </div>

        <div class="radar-stage">
          <div class="radar-backdrop" />
          <div class="radar-crosshair horizontal" />
          <div class="radar-crosshair vertical" />
          <div class="radar-ring ring-lg" />
          <div class="radar-ring ring-md" />
          <div class="radar-ring ring-sm" />
          <div class="radar-sweep" />
          <div class="radar-core-wrap">
            <div class="radar-core-label">TASK HEALTH</div>
            <div class="radar-core">{{ taskHealthScore }}%</div>
          </div>
          <div class="radar-node node-running">
            <span>RUN</span>
            <strong>{{ runningJobs }}</strong>
          </div>
          <div class="radar-node node-paused">
            <span>PAUSE</span>
            <strong>{{ pausedJobs }}</strong>
          </div>
          <div class="radar-node node-failed">
            <span>ALERT</span>
            <strong>{{ failedJobs }}</strong>
          </div>
          <div class="radar-node node-queued">
            <span>QUEUE</span>
            <strong>{{ queuedJobs }}</strong>
          </div>
        </div>

        <div class="radar-footer">
          <div class="radar-legend">
            <span><i class="live" />运行</span>
            <span><i class="pause" />暂停</span>
            <span><i class="alert" />异常</span>
            <span><i class="idle" />排队</span>
          </div>
          <div class="radar-footnote">命令流健康度由任务异常占比与当前在线态共同估算</div>
        </div>
      </article>

      <article class="panel-shell activity-panel">
        <div class="panel-head overlay-head">
          <div>
            <p class="panel-kicker">ACTIVITY STREAM</p>
            <h2>运行活动流</h2>
          </div>
          <span class="panel-side">近 12 日</span>
        </div>

        <div class="stream-shell">
          <div class="stream-grid-lines" />
          <svg class="stream-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline
              :points="activitySignal.map(point => `${point.x.replace('%', '')},${point.y.replace('%', '')}`).join(' ')"
              fill="none"
              stroke="url(#streamGradient)"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <defs>
              <linearGradient id="streamGradient" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stop-color="#63e7ff" />
                <stop offset="55%" stop-color="#7dd3fc" />
                <stop offset="100%" stop-color="#a98cff" />
              </linearGradient>
            </defs>
          </svg>
          <div class="activity-bars refined">
            <div v-for="bar in activityBars" :key="bar.id" class="activity-slot">
              <span class="activity-track" />
              <span class="activity-bar" :class="bar.status" :style="{ height: `${bar.height}px` }" />
              <small>{{ bar.label }}</small>
            </div>
          </div>
        </div>

        <div class="activity-meta elevated">
          <div>
            <span>Jobs</span>
            <strong>{{ jobsStore.jobs.length }}</strong>
          </div>
          <div>
            <span>Skills</span>
            <strong>{{ enabledSkills }}/{{ totalSkills }}</strong>
          </div>
          <div>
            <span>Memory</span>
            <strong>{{ memory ? 'READY' : 'PENDING' }}</strong>
          </div>
        </div>
      </article>
    </section>

    <section class="metrics-grid refined-grid">
      <article class="panel-shell token-card deluxe-card">
        <div class="panel-head overlay-head">
          <div>
            <p class="panel-kicker">TOKEN PULSE</p>
            <h2>用量脉冲</h2>
          </div>
          <span class="panel-side">30d window</span>
        </div>
        <div class="token-main deluxe-main">
          <strong>{{ formatTokens(usageStore.totalTokens) }}</strong>
          <small>input {{ formatTokens(usageStore.totalInputTokens) }} · output {{ formatTokens(usageStore.totalOutputTokens) }}</small>
        </div>
        <div class="token-spark refined">
          <div v-for="bar in tokenPulse" :key="bar.id" class="token-col">
            <span class="token-bar" :style="{ height: `${bar.height}px` }" />
            <small>{{ bar.label }}</small>
          </div>
        </div>
      </article>

      <article class="panel-shell metric-card subtle-card">
        <div class="panel-head compact overlay-head">
          <div>
            <p class="panel-kicker">COST TRACE</p>
            <h2>成本与缓存</h2>
          </div>
        </div>
        <div class="metric-stack refined-stack">
          <div>
            <span>Estimated</span>
            <strong>{{ formatCost(usageStore.estimatedCost) }}</strong>
          </div>
          <div>
            <span>Cache Read</span>
            <strong>{{ formatTokens(usageStore.totalCacheTokens) }}</strong>
          </div>
          <div>
            <span>Hit Rate</span>
            <strong>{{ usageStore.cacheHitRate == null ? '—' : `${usageStore.cacheHitRate.toFixed(1)}%` }}</strong>
          </div>
        </div>
      </article>

      <article class="panel-shell metric-card subtle-card">
        <div class="panel-head compact overlay-head">
          <div>
            <p class="panel-kicker">MODEL TRAFFIC</p>
            <h2>模型活动</h2>
          </div>
        </div>
        <div class="top-model-strip">
          <div v-for="item in topModels" :key="item.model" class="top-model-row">
            <span class="model-pill">{{ item.model }}</span>
            <strong>{{ formatTokens(item.totalTokens) }}</strong>
          </div>
        </div>
      </article>

      <article class="panel-shell metric-card subtle-card">
        <div class="panel-head compact overlay-head">
          <div>
            <p class="panel-kicker">MEMORY CORE</p>
            <h2>记忆状态</h2>
          </div>
        </div>
        <div class="metric-stack refined-stack">
          <div>
            <span>Status</span>
            <strong>{{ memory ? 'INDEXED' : 'PENDING' }}</strong>
          </div>
          <div>
            <span>Updated</span>
            <strong>{{ memoryUpdated }}</strong>
          </div>
          <div>
            <span>Skill Groups</span>
            <strong>{{ skillCategoryCount }}</strong>
          </div>
        </div>
      </article>

      <article class="panel-shell subsystem-card deluxe-card">
        <div class="panel-head compact overlay-head">
          <div>
            <p class="panel-kicker">SUBSYSTEMS</p>
            <h2>系统健康</h2>
          </div>
          <span class="panel-side">{{ healthySubsystems }}/{{ subsystems.length }}</span>
        </div>
        <div class="subsystem-list refined-subsystems">
          <div v-for="item in subsystems" :key="item.name" class="subsystem-row" :class="item.tone">
            <span class="subsystem-dot" />
            <div>
              <strong>{{ item.name }}</strong>
              <small>{{ item.value }}</small>
            </div>
          </div>
        </div>
      </article>
    </section>

    <section class="watch-grid refined-watch">
      <article class="panel-shell watch-panel deluxe-card">
        <div class="panel-head overlay-head">
          <div>
            <p class="panel-kicker">RECENT SIGNALS</p>
            <h2>最近动态</h2>
          </div>
        </div>
        <div class="watch-list refined-watch-list">
          <div v-for="item in events" :key="item.title" class="watch-item" :class="item.tone">
            <strong>{{ item.title }}</strong>
            <span>{{ item.value }}</span>
            <small>{{ item.meta }}</small>
          </div>
        </div>
      </article>

      <article class="panel-shell watch-panel deluxe-card">
        <div class="panel-head overlay-head">
          <div>
            <p class="panel-kicker">ALERT DESK</p>
            <h2>异常观察</h2>
          </div>
        </div>
        <div class="watch-list refined-watch-list">
          <div v-for="item in alerts" :key="item.title" class="watch-item" :class="item.tone">
            <strong>{{ item.title }}</strong>
            <span>{{ item.detail }}</span>
          </div>
        </div>
      </article>
    </section>
  </section>
</template>

<style scoped lang="scss">
.monitor-view {
  position: relative;
  min-height: calc(100 * var(--vh));
  padding: 24px;
  overflow: hidden auto;
  color: #f8fafc;
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.12), transparent 28%),
    radial-gradient(circle at 88% 10%, rgba(34, 197, 94, 0.11), transparent 24%),
    linear-gradient(135deg, #02040b 0%, #07111f 42%, #02040b 100%);
}

.monitor-view::before {
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

.monitor-grid-bg,
.noise-overlay,
.home-header,
.status-spine,
.hero-grid,
.metrics-grid,
.watch-grid,
.monitor-warning {
  position: relative;
  z-index: 1;
}

.monitor-grid-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.12;
  background: repeating-linear-gradient(0deg, transparent 0 8px, rgba(255, 255, 255, 0.26) 9px);
}

.noise-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.04;
  background-image: radial-gradient(rgba(255, 255, 255, 0.6) 0.5px, transparent 0.6px);
  background-size: 12px 12px;
  mix-blend-mode: screen;
}

.panel-shell {
  position: relative;
  border: 1px solid rgba(99, 231, 255, 0.12);
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(8, 18, 34, 0.88), rgba(3, 8, 18, 0.78));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 24px 48px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(18px);
  overflow: hidden;
}

.panel-shell::before {
  content: '';
  position: absolute;
  inset: 1px;
  border-radius: 27px;
  pointer-events: none;
  border: 1px solid rgba(255, 255, 255, 0.025);
}

.panel-shell::after {
  content: '';
  position: absolute;
  left: 24px;
  right: 24px;
  top: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(99, 231, 255, 0.28), transparent);
  pointer-events: none;
}

.home-header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 26px 28px;
}

.header-copy {
  display: grid;
  gap: 10px;
  max-width: 780px;
}

.title-line {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.title-badge {
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid rgba(99, 231, 255, 0.18);
  background: rgba(99, 231, 255, 0.08);
  color: #a7f3ff;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  letter-spacing: 0.18em;
}

.home-kicker,
.panel-kicker,
.spine-label {
  margin: 0;
  color: #63e7ff;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.header-copy h1,
.panel-head h2 {
  margin: 0;
  color: #f8fafc;
  font-size: 30px;
  font-weight: 640;
  letter-spacing: -0.02em;
}

.home-summary {
  margin: 0;
  max-width: 720px;
  color: #8ba0bd;
  font-size: 13px;
  line-height: 1.75;
}

.header-frequency {
  margin-top: 8px;
  display: flex;
  align-items: end;
  gap: 5px;
  height: 54px;
}

.header-frequency span {
  width: 4px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(99, 231, 255, 0.92), rgba(99, 231, 255, 0.04));
  box-shadow: 0 0 12px rgba(99, 231, 255, 0.24);
}

.header-actions {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.heartbeat {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid rgba(99, 231, 255, 0.16);
  border-radius: 999px;
  color: #9eb0c8;
  font-size: 12px;
  background: rgba(4, 10, 21, 0.58);
}

.heartbeat.online {
  color: #d5fff2;
  border-color: rgba(110, 231, 183, 0.3);
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #7f90aa;
}

.heartbeat.online .pulse-dot {
  background: #6ee7b7;
  box-shadow: 0 0 12px rgba(110, 231, 183, 0.9);
}

.status-spine {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  padding: 14px;
}

.spine-cell {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border-radius: 20px;
  background: rgba(6, 13, 26, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.spine-cell.primary {
  background: linear-gradient(180deg, rgba(99, 231, 255, 0.11), rgba(6, 13, 26, 0.7));
}

.spine-cell.emphasis {
  background: linear-gradient(180deg, rgba(169, 140, 255, 0.11), rgba(6, 13, 26, 0.7));
}

.spine-cell.accent {
  background: linear-gradient(180deg, rgba(110, 231, 183, 0.1), rgba(6, 13, 26, 0.7));
}

.spine-cell strong {
  font-size: 16px;
  font-weight: 600;
  color: #edf7ff;
}

.spine-cell small,
.panel-side,
.watch-item small,
.metric-stack span,
.activity-meta span,
.radar-legend span,
.subsystem-row small,
.radar-footnote,
.token-col small,
.activity-slot small {
  color: #7f90aa;
  font-size: 11px;
}

.monitor-warning {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(251, 191, 36, 0.24);
  background: rgba(251, 191, 36, 0.08);
  color: #fcd34d;
  font-size: 12px;
}

.hero-grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 1.08fr 0.92fr;
  gap: 18px;
}

.metrics-grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 18px;
}

.watch-grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  padding-bottom: 12px;
}

.overlay-head {
  position: relative;
  z-index: 2;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.panel-head.compact h2 {
  font-size: 18px;
}

.radar-panel,
.activity-panel,
.token-card,
.metric-card,
.watch-panel,
.subsystem-card {
  padding: 22px;
}

.deluxe-card {
  background: linear-gradient(180deg, rgba(9, 20, 39, 0.95), rgba(3, 8, 18, 0.82));
}

.subtle-card {
  background: linear-gradient(180deg, rgba(7, 16, 31, 0.88), rgba(3, 8, 18, 0.76));
}

.radar-stage {
  position: relative;
  margin-top: 18px;
  aspect-ratio: 1 / 1;
  border-radius: 30px;
  background: radial-gradient(circle at center, rgba(99, 231, 255, 0.08), rgba(2, 6, 23, 0.5));
  overflow: hidden;
  border: 1px solid rgba(99, 231, 255, 0.12);
}

.radar-backdrop {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, rgba(99, 231, 255, 0.08), transparent 58%);
}

.radar-crosshair {
  position: absolute;
  background: rgba(99, 231, 255, 0.08);
}

.radar-crosshair.horizontal {
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
}

.radar-crosshair.vertical {
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
}

.radar-ring,
.radar-sweep,
.radar-node,
.radar-core-wrap {
  position: absolute;
}

.radar-ring {
  border: 1px solid rgba(99, 231, 255, 0.12);
  border-radius: 50%;
}

.ring-lg { inset: 10%; }
.ring-md { inset: 25%; }
.ring-sm { inset: 40%; }

.radar-sweep {
  inset: -10%;
  background: conic-gradient(from 90deg, rgba(99, 231, 255, 0), rgba(99, 231, 255, 0.34), rgba(99, 231, 255, 0));
  animation: sweep 6s linear infinite;
}

.radar-core-wrap {
  top: 50%;
  left: 50%;
  width: 120px;
  height: 120px;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid rgba(99, 231, 255, 0.24);
  background: radial-gradient(circle, rgba(8, 18, 34, 0.96), rgba(2, 6, 23, 0.84));
  box-shadow: 0 0 34px rgba(99, 231, 255, 0.18);
}

.radar-core-label {
  position: absolute;
  top: 28px;
  color: #7f90aa;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  letter-spacing: 0.16em;
}

.radar-core {
  font-size: 30px;
  font-weight: 680;
  color: #63e7ff;
}

.radar-node {
  min-width: 76px;
  padding: 10px 10px 9px;
  border-radius: 18px;
  text-align: center;
  border: 1px solid rgba(99, 231, 255, 0.14);
  background: rgba(4, 10, 21, 0.9);
  backdrop-filter: blur(10px);
  display: grid;
  gap: 4px;
}

.radar-node span {
  color: #7f90aa;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  letter-spacing: 0.16em;
}

.radar-node strong {
  font-size: 16px;
  color: #edf7ff;
}

.node-running { top: 14%; left: 50%; transform: translateX(-50%); }
.node-paused { right: 10%; top: 47%; }
.node-failed { left: 10%; top: 53%; }
.node-queued { left: 50%; bottom: 11%; transform: translateX(-50%); }

.radar-footer {
  margin-top: 14px;
  display: grid;
  gap: 10px;
}

.radar-legend {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.radar-legend i {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}

.radar-legend .live { background: #63e7ff; }
.radar-legend .pause { background: #a98cff; }
.radar-legend .alert { background: #f87171; }
.radar-legend .idle { background: #94a3b8; }

.stream-shell {
  position: relative;
  margin-top: 18px;
  min-height: 270px;
  padding: 18px 14px 12px;
  border-radius: 24px;
  border: 1px solid rgba(99, 231, 255, 0.08);
  background: linear-gradient(180deg, rgba(5, 11, 22, 0.8), rgba(2, 6, 16, 0.56));
}

.stream-grid-lines {
  position: absolute;
  inset: 16px 14px 26px;
  background-image: linear-gradient(rgba(99, 231, 255, 0.08) 1px, transparent 1px);
  background-size: 100% 25%;
  opacity: 0.5;
}

.stream-path {
  position: absolute;
  inset: 24px 14px 48px;
  width: calc(100% - 28px);
  height: calc(100% - 72px);
  opacity: 0.82;
}

.activity-bars {
  margin-top: 22px;
  min-height: 180px;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  align-items: end;
  gap: 8px;
}

.activity-bars.refined {
  position: relative;
  z-index: 1;
  min-height: 208px;
  gap: 10px;
}

.activity-slot {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: end;
  align-items: center;
  gap: 8px;
  height: 100%;
}

.activity-track {
  position: absolute;
  bottom: 20px;
  width: 100%;
  max-width: 18px;
  height: calc(100% - 34px);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
}

.activity-bar {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 18px;
  border-radius: 999px 999px 8px 8px;
  background: rgba(148, 163, 184, 0.28);
  box-shadow: 0 0 16px rgba(148, 163, 184, 0.14);
}

.activity-bar.live {
  background: linear-gradient(180deg, rgba(99, 231, 255, 0.95), rgba(77, 141, 255, 0.28));
}

.activity-bar.warn {
  background: linear-gradient(180deg, rgba(251, 191, 36, 0.95), rgba(248, 113, 113, 0.42));
}

.activity-meta {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.activity-meta.elevated div {
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(4, 10, 21, 0.54);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.activity-meta div,
.metric-stack div {
  display: grid;
  gap: 4px;
}

.activity-meta strong,
.metric-stack strong,
.watch-item strong,
.subsystem-row strong,
.top-model-row strong {
  color: #edf7ff;
}

.refined-grid {
  align-items: stretch;
}

.token-card {
  grid-column: span 5;
}

.subsystem-card {
  grid-column: span 4;
}

.metrics-grid > .metric-card:not(.token-card):not(.subsystem-card) {
  grid-column: span 3;
}

.deluxe-main {
  margin-top: 20px;
  display: grid;
  gap: 6px;
}

.deluxe-main strong {
  font-size: 34px;
  color: #f8fafc;
  letter-spacing: -0.02em;
}

.deluxe-main small {
  color: #8ba0bd;
}

.token-spark {
  margin-top: 22px;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 10px;
  align-items: end;
}

.token-spark.refined {
  gap: 14px;
}

.token-col {
  display: grid;
  gap: 8px;
  justify-items: center;
}

.token-bar {
  width: 100%;
  max-width: 30px;
  border-radius: 999px 999px 10px 10px;
  background: linear-gradient(180deg, rgba(110, 231, 183, 0.98), rgba(99, 231, 255, 0.18));
  box-shadow: 0 0 22px rgba(110, 231, 183, 0.22);
}

.refined-stack {
  margin-top: 22px;
  display: grid;
  gap: 16px;
}

.refined-stack strong {
  font-size: 19px;
}

.top-model-strip {
  margin-top: 22px;
  display: grid;
  gap: 10px;
}

.top-model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(4, 10, 21, 0.58);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.model-pill {
  color: #cbe5ff;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
}

.refined-subsystems {
  margin-top: 20px;
  display: grid;
  gap: 10px;
}

.subsystem-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(4, 10, 21, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.subsystem-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #7f90aa;
}

.subsystem-row.good .subsystem-dot { background: #6ee7b7; box-shadow: 0 0 10px rgba(110, 231, 183, 0.9); }
.subsystem-row.warn .subsystem-dot { background: #fcd34d; box-shadow: 0 0 10px rgba(252, 211, 77, 0.9); }
.subsystem-row.bad .subsystem-dot { background: #f87171; box-shadow: 0 0 10px rgba(248, 113, 113, 0.9); }

.refined-watch {
  align-items: stretch;
}

.refined-watch-list {
  margin-top: 20px;
  display: grid;
  gap: 12px;
}

.watch-item {
  display: grid;
  gap: 5px;
  padding: 13px 15px;
  border-radius: 18px;
  background: rgba(4, 10, 21, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.watch-item.good {
  border-color: rgba(110, 231, 183, 0.18);
}

.watch-item.warn {
  border-color: rgba(251, 191, 36, 0.2);
}

.watch-item.bad {
  border-color: rgba(248, 113, 113, 0.22);
}

@keyframes sweep {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 1400px) {
  .status-spine,
  .hero-grid,
  .watch-grid {
    grid-template-columns: 1fr;
  }

  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .token-card,
  .subsystem-card,
  .metrics-grid > .metric-card:not(.token-card):not(.subsystem-card) {
    grid-column: span 1;
  }
}

@media (max-width: 900px) {
  .monitor-view {
    padding: 16px;
  }

  .home-header {
    flex-direction: column;
  }

  .header-actions {
    align-items: center;
    justify-content: space-between;
  }

  .status-spine,
  .metrics-grid,
  .watch-grid {
    grid-template-columns: 1fr;
  }

  .activity-meta {
    grid-template-columns: 1fr;
  }

  .title-line {
    align-items: flex-start;
  }
}
</style>
