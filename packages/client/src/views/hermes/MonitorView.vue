<script setup lang="ts">
import { computed, onMounted, ref, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton } from 'naive-ui'
import { useAppStore } from '@/stores/hermes/app'
import { useJobsStore } from '@/stores/hermes/jobs'
import { useUsageStore } from '@/stores/hermes/usage'
import { fetchConfig, type AppConfig } from '@/api/hermes/config'
import { checkHealth, type HealthResponse } from '@/api/hermes/system'
import { fetchSkills, fetchMemory, type MemoryData, type SkillCategory, type SkillInfo } from '@/api/hermes/skills'

const { t } = useI18n()
const appStore = useAppStore()
const jobsStore = useJobsStore()
const usageStore = useUsageStore()

const loading = ref(false)
const health = ref<HealthResponse | null>(null)
const platforms = ref<AppConfig['platforms']>({})
const skills = ref<{ categories: SkillCategory[], archived: SkillInfo[] }>({ categories: [], archived: [] })
const memory = ref<MemoryData | null>(null)
const lastUpdated = ref('—')
const loadError = ref('')
const currentTime = ref(new Date())
let clockTimer: ReturnType<typeof setInterval>
let pollTimer: ReturnType<typeof setInterval>

// ── Entrance animation ───────────────────────────────────────────────────────
const animStarted = ref(false)
let animFrame: number

function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3) }

function useCountUp(to: number, ms: number, cb: (v: number) => void) {
  const start = performance.now()
  const from = 0
  function step(now: number) {
    const t = Math.min((now - start) / ms, 1)
    cb(Math.round(from + (to - from) * easeOutCubic(t)))
    if (t < 1) animFrame = requestAnimationFrame(step)
  }
  animFrame = requestAnimationFrame(step)
}

function startAnimations() {
  animStarted.value = true
  useCountUp(usageStore.totalTokens, 900, v => { animTokens.value = v })
  useCountUp(usageStore.totalSessions, 900, v => { animSessions.value = v })
  useCountUp(configuredChannels.value, 800, v => { animChan.value = v })
  useCountUp(runningJobs.value, 700, v => { animJobs.value = v })
  useCountUp(pausedJobs.value, 700, v => { animJobsPause.value = v })
  useCountUp(overallHealth.value, 900, v => { animHealth.value = v })
}

const animTokens = ref(0)
const animSessions = ref(0)
const animChan = ref(0)
const animJobs = ref(0)
const animJobsPause = ref(0)
const animHealth = ref(0)

const fmtAnim = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

const totalSkills = computed(() => skills.value.categories.reduce((s: number, c: SkillCategory) => s + c.skills.length, 0))
const enabledSkills = computed(() => skills.value.categories.reduce((s: number, c: SkillCategory) => s + c.skills.filter((sk: SkillInfo) => sk.enabled !== false).length, 0))
const totalModels = computed(() => appStore.modelGroups.reduce((s: number, g) => s + g.models.length, 0))
const runningJobs = computed(() => jobsStore.jobs.filter(j => j.enabled && !j.paused_at).length)
const pausedJobs = computed(() => jobsStore.jobs.filter(j => !j.enabled || j.paused_at).length)
const failedJobs = computed(() => jobsStore.jobs.filter(j => j.last_status === 'failed' || !!j.last_error).length)

const timeStr = computed(() => currentTime.value.toLocaleTimeString('zh-CN', { hour12: false }))
const dateStr = computed(() => currentTime.value.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' }))

// ── Subsystems ──────────────────────────────────────────────────────────────
const subsystems = computed(() => [
  { name: 'Gateway', value: health.value?.status === 'ok' ? 'online' : 'checking', tone: health.value?.status === 'ok' ? 'good' : 'warn' as 'good' | 'warn' | 'bad', arc: 60 },
  { name: 'BFF', value: appStore.connected ? 'linked' : 'offline', tone: appStore.connected ? 'good' : 'bad' as 'good' | 'warn' | 'bad', arc: 60 },
  { name: 'Models', value: `${totalModels.value}`, tone: totalModels.value ? 'good' : 'warn' as 'good' | 'warn' | 'bad', arc: 55 },
  { name: 'Jobs', value: `${runningJobs.value} active`, tone: failedJobs.value ? 'bad' : 'good' as 'good' | 'warn' | 'bad', arc: 50 },
  { name: 'Memory', value: memory.value ? 'indexed' : 'pending', tone: memory.value ? 'good' : 'warn' as 'good' | 'warn' | 'bad', arc: 45 },
  { name: 'Skills', value: `${enabledSkills.value}/${totalSkills.value}`, tone: totalSkills.value ? 'good' : 'warn' as 'good' | 'warn' | 'bad', arc: 40 },
])

const healthyCount = computed(() => subsystems.value.filter(s => s.tone === 'good').length)
const overallHealth = computed(() => Math.round((healthyCount.value / subsystems.value.length) * 100))

const TONE_COLOR: Record<string, string> = { good: '#4ade80', warn: '#fbbf24', bad: '#f87171' }

// SVG health ring params
const CX = 60, CY = 60

// Generate arc path for a subsystem segment (donut arc, outer R_OUTER inner R_INNER)
function arcPath(index: number, _tone: string): string {
  const cx = 60, cy = 60, rOut = 54, rIn = 44
  const startAngle = -90 + index * (300 / 6)
  const segDeg = (300 / 6) - 4
  const sa = (startAngle * Math.PI) / 180
  const ea = ((startAngle + segDeg) * Math.PI) / 180
  const sx = cx + rOut * Math.cos(sa);  const sy = cy + rOut * Math.sin(sa)
  const ex = cx + rOut * Math.cos(ea); const ey = cy + rOut * Math.sin(ea)
  const sx2 = cx + rIn * Math.cos(ea); const sy2 = cy + rIn * Math.sin(ea)
  const ex2 = cx + rIn * Math.cos(sa); const ey2 = cy + rIn * Math.sin(sa)
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${rOut} ${rOut} 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)} L ${sx2.toFixed(2)} ${sy2.toFixed(2)} A ${rIn} ${rIn} 0 0 0 ${ex2.toFixed(2)} ${ey2.toFixed(2)} Z`
}

// Outer tick marks (60 ticks for seconds/minutes feel)
const outerTicks = computed(() => {
  return Array.from({ length: 60 }, (_, i) => {
    const angle = (i * 6 - 90) * (Math.PI / 180)
    const isMajor = i % 5 === 0
    const x1 = CX + (isMajor ? 57 : 58.5) * Math.cos(angle)
    const y1 = CY + (isMajor ? 57 : 58.5) * Math.sin(angle)
    const x2 = CX + 61 * Math.cos(angle)
    const y2 = CY + 61 * Math.sin(angle)
    return { x1, y1, x2, y2, major: isMajor }
  })
})

// ── Activity chart ─────────────────────────────────────────────────────────
const activityDays = computed(() => {
  const days = usageStore.dailyUsage.slice(-30)
  if (!days.length) return []
  const maxSessions = Math.max(...days.map(d => d.sessions), 1)
  return days.map((d, i) => ({
    ...d,
    pct: (d.sessions / maxSessions) * 100,
    x: days.length <= 1 ? 50 : (i / (days.length - 1)) * 100,
    y: 100 - (d.sessions / maxSessions) * 92,
    hasError: d.errors > 0,
  }))
})

const areaPathD = computed(() => {
  const pts = activityDays.value
  if (!pts.length) return ''
  const bottom = 98
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  const first = pts[0]
  return `${line} L ${last.x.toFixed(1)} ${bottom} L ${first.x.toFixed(1)} ${bottom} Z`
})

const linePathD = computed(() => {
  const pts = activityDays.value
  if (!pts.length) return ''
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
})

const chartTicks = computed(() => {
  const pts = activityDays.value
  if (!pts.length) return []
  return [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]]
})

const totalSessions = computed(() => activityDays.value.reduce((s, d) => s + d.sessions, 0))
const errorDays = computed(() => activityDays.value.filter(d => d.hasError).length)
const peakDay = computed(() => {
  const pts = activityDays.value
  if (!pts.length) return '—'
  return pts.reduce((a, b) => (b.sessions > a.sessions ? b : a)).date?.slice(5) || '—'
})

// ── Job queue ──────────────────────────────────────────────────────────────
const recentJobs = computed(() => jobsStore.jobs.slice(0, 8))

function jobStatus(job: any) {
  if (job.last_status === 'failed' || job.last_error) return 'bad'
  if (!job.enabled || job.paused_at) return 'paused'
  return 'running'
}

function jobNextRun(job: any): string {
  if (!job.next_run_at) return '—'
  return new Date(job.next_run_at * 1000).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function jobLastRun(job: any): string {
  if (!job.last_run_at) return '从未'
  return new Date(job.last_run_at * 1000).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Resource panel tabs ────────────────────────────────────────────────────
const resourceTab = ref<'token' | 'skills'>('token')

const tokenPeriod = ref<'today' | 'week' | 'month'>('week')
const skillPeriod = ref<'today' | 'week' | 'month'>('week')

function getDayTokens(day: any) { return day.input_tokens + day.output_tokens }
function getWeekTokens() { return usageStore.dailyUsage.slice(-7).reduce((s: number, d: any) => s + getDayTokens(d), 0) }
function getMonthTokens() { return usageStore.dailyUsage.reduce((s: number, d: any) => s + getDayTokens(d), 0) }

const displayedTokenCount = computed(() => {
  if (tokenPeriod.value === 'today') return usageStore.totalTokens
  if (tokenPeriod.value === 'week') return getWeekTokens()
  return getMonthTokens()
})

const displayedTokenInput = computed(() => {
  const days = tokenPeriod.value === 'today' ? usageStore.dailyUsage.slice(-1) : tokenPeriod.value === 'week' ? usageStore.dailyUsage.slice(-7) : usageStore.dailyUsage
  return days.reduce((s: number, d: any) => s + d.input_tokens, 0)
})

const displayedTokenOutput = computed(() => {
  const days = tokenPeriod.value === 'today' ? usageStore.dailyUsage.slice(-1) : tokenPeriod.value === 'week' ? usageStore.dailyUsage.slice(-7) : usageStore.dailyUsage
  return days.reduce((s: number, d: any) => s + d.output_tokens, 0)
})

// Mini sparkline: last 7 days
const sparkDays = computed(() => {
  const days = usageStore.dailyUsage.slice(-7)
  if (!days.length) return []
  const max = Math.max(...days.map(d => d.input_tokens + d.output_tokens), 1)
  return days.map(d => ({
    pct: Math.max(8, ((d.input_tokens + d.output_tokens) / max) * 100),
    hasError: d.errors > 0,
  }))
})

// Skills data
const skillStats = computed(() => {
  const cats = skills.value.categories
  const totalCalls = cats.reduce((s, c: SkillCategory) => s + c.skills.reduce((ss, sk: SkillInfo) => ss + (sk as any).useCount, 0), 0)
  const failedCalls = cats.reduce((s, c: SkillCategory) => s + c.skills.length, 0)
  return { total: totalCalls, failed: failedCalls, success: totalCalls - failedCalls }
})

const topSkills = computed(() => {
  const all = skills.value.categories.flatMap(c => c.skills)
  return all.sort((a: any, b: any) => (b.useCount ?? 0) - (a.useCount ?? 0)).slice(0, 5)
})

// ── Channels ──────────────────────────────────────────────────────────────
const ALL_CHANNELS = ['telegram', 'discord', 'feishu', 'slack', 'whatsapp', 'weixin', 'wecom', 'dingtalk', 'matrix']

const CHANNEL_META: Record<string, { label: string; icon: string }> = {
  telegram: { label: 'Telegram', icon: 'TG' },
  discord: { label: 'Discord', icon: 'DC' },
  feishu: { label: 'Feishu', icon: 'FS' },
  slack: { label: 'Slack', icon: 'SL' },
  whatsapp: { label: 'WhatsApp', icon: 'WA' },
  weixin: { label: 'Weixin', icon: 'WX' },
  wecom: { label: 'WeCom', icon: 'WC' },
  dingtalk: { label: 'DingTalk', icon: 'DT' },
  matrix: { label: 'Matrix', icon: 'MX' },
}

const channels = computed(() => {
  return ALL_CHANNELS
    .filter(name => platforms.value?.[name]?.enabled !== false)
    .map(name => ({
      name: CHANNEL_META[name]?.label ?? name,
      icon: CHANNEL_META[name]?.icon ?? name.slice(0, 2).toUpperCase(),
      configured: !!(platforms.value?.[name]?.token || platforms.value?.[name]?.enabled),
    }))
})

const configuredChannels = computed(() => channels.value.filter(c => c.configured).length)

// ── Recent events ─────────────────────────────────────────────────────────
const recentEvents = computed(() => {
  const evs: Array<{ time: string; type: 'info' | 'warn' | 'error' | 'success'; msg: string }> = []

  if (!appStore.connected) {
    evs.push({ time: timeStr.value, type: 'error', msg: 'BFF 与 Gateway 连接断开' })
  }

  jobsStore.jobs.filter(j => j.last_status === 'failed').forEach(j => {
    evs.push({ time: jobLastRun(j), type: 'error', msg: `任务「${j.name}」执行失败` })
  })

  if (failedJobs.value > 0) {
    evs.push({ time: timeStr.value, type: 'warn', msg: `${failedJobs.value} 个任务存在异常` })
  }

  if (!memory.value) {
    evs.push({ time: timeStr.value, type: 'warn', msg: '记忆索引尚未就绪' })
  }

  // Recent job runs
  jobsStore.jobs.filter(j => j.last_run_at).slice(0, 3).forEach(j => {
    if (j.last_status === 'success') {
      evs.push({ time: jobLastRun(j), type: 'success', msg: `任务「${j.name}」执行成功` })
    }
  })

  if (!evs.length) {
    evs.push({ time: timeStr.value, type: 'info', msg: '系统运行平稳，无异常事件' })
  }

  return evs.slice(0, 12)
})

// ── Formatters ─────────────────────────────────────────────────────────────
function fmt(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

function fmtCost(v: number) {
  if (!v) return '$0.00'
  return `$${v.toFixed(2)}`
}

// ── Refresh ────────────────────────────────────────────────────────────────
async function refresh() {
  loading.value = true
  loadError.value = ''
  try {
    const [hr, cf, sr, mr, jr, ap, cr, ur] = await Promise.allSettled([
      checkHealth(),
      fetchConfig(['platforms']),
      fetchSkills(),
      fetchMemory(),
      jobsStore.fetchJobs(),
      appStore.loadModels(),
      appStore.checkConnection(),
      usageStore.loadSessions(),
    ])
    if (hr.status === 'fulfilled') health.value = hr.value
    if (cf.status === 'fulfilled') platforms.value = cf.value?.platforms ?? {}
    if (sr.status === 'fulfilled') skills.value = sr.value
    if (mr.status === 'fulfilled') memory.value = mr.value
    const failed = [hr, cf, sr, mr, jr, ap, cr, ur].filter(r => r.status === 'rejected').length
    if (failed) loadError.value = `${failed} 个数据源暂时不可用`
    lastUpdated.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refresh()
  clockTimer = setInterval(() => { currentTime.value = new Date() }, 1000)
  pollTimer = setInterval(() => refresh(), 30_000)
  // Delay slightly so data is loaded before animation starts
  setTimeout(() => startAnimations(), 120)
})

onUnmounted(() => {
  clearInterval(clockTimer)
  clearInterval(pollTimer)
  cancelAnimationFrame(animFrame)
})
</script>

<template>
  <section class="cc-view">

    <!-- ═══════════════════════════════════════════════════════════ TOP BAR -->
    <header class="topbar">
      <div class="topbar-brand">
        <span class="brand-glyph">九</span>
        <div class="brand-text">
          <span class="brand-name">小九中枢</span>
          <span class="brand-sub">HERMES COMMAND CENTER</span>
        </div>
      </div>

      <div class="topbar-metrics">
        <div class="tm-cell" :class="{ alert: !appStore.connected }">
          <span class="tm-label">CORE</span>
          <span class="tm-value">
            <span class="tm-dot" :class="appStore.connected ? 'live' : 'dead'" />
            {{ appStore.connected ? 'ONLINE' : 'OFFLINE' }}
          </span>
        </div>
        <div class="tm-sep" />
        <div class="tm-cell">
          <span class="tm-label">MODEL</span>
          <span class="tm-value model">{{ appStore.selectedModel?.split('/').pop() || '—' }}</span>
        </div>
        <div class="tm-sep" />
        <div class="tm-cell">
          <span class="tm-label">TASKS</span>
          <span class="tm-value">
            <span class="txt-cyan">{{ animStarted ? animJobs : runningJobs }}</span>
            <span class="txt-sep">/</span>
            <span class="txt-dim">{{ animStarted ? animJobsPause : pausedJobs }}</span>
            <span v-if="failedJobs" class="txt-red">/ {{ failedJobs }}</span>
          </span>
        </div>
        <div class="tm-sep" />
        <div class="tm-cell">
          <span class="tm-label">TOKEN</span>
          <span class="tm-value">{{ animStarted ? fmtAnim(animTokens) : fmt(usageStore.totalTokens) }}</span>
        </div>
        <div class="tm-sep" />
        <div class="tm-cell">
          <span class="tm-label">COST</span>
          <span class="tm-value">{{ fmtCost(usageStore.estimatedCost) }}</span>
        </div>
        <div class="tm-sep" />
        <div class="tm-cell">
          <span class="tm-label">MEM</span>
          <span class="tm-value" :class="memory ? 'txt-green' : 'txt-amber'">
            {{ memory ? 'IDX' : 'PEND' }}
          </span>
        </div>
        <div class="tm-sep" />
        <div class="tm-cell">
          <span class="tm-label">SESS</span>
          <span class="tm-value">{{ animStarted ? fmtAnim(animSessions) : usageStore.totalSessions }}</span>
        </div>
        <div class="tm-sep" />
        <div class="tm-cell">
          <span class="tm-label">CHAN</span>
          <span class="tm-value">{{ animStarted ? animChan : configuredChannels }}/{{ channels.length }}</span>
        </div>
      </div>

      <div class="topbar-right">
        <div class="clock">
          <span class="clock-time">{{ timeStr }}</span>
          <span class="clock-date">{{ dateStr }}</span>
        </div>
        <div class="live-dot" :class="{ pulse: appStore.connected }" />
        <NButton size="tiny" secondary :loading="loading" @click="refresh">
          {{ t('monitor.refresh') }}
        </NButton>
      </div>
    </header>

    <!-- ═══════════════════════════════════════════════════════ HERO GRID -->
    <section class="hero-grid">

      <!-- A: Health Radar -->
      <article class="panel radar-panel entrance-1">
        <div class="panel-cap">
          <span class="cap-label">SYSTEM HEALTH</span>
          <span class="cap-badge" :class="overallHealth >= 80 ? 'green' : overallHealth >= 50 ? 'amber' : 'red'">
            {{ overallHealth }}%
          </span>
        </div>

        <div class="radar-body">
          <svg class="radar-svg" viewBox="0 0 120 120" aria-label="系统健康雷达">
            <!-- Outer tick ring -->
            <g class="tick-ring">
              <line
                v-for="(tick, i) in outerTicks"
                :key="i"
                :x1="tick.x1.toFixed(1)" :y1="tick.y1.toFixed(1)"
                :x2="tick.x2.toFixed(1)" :y2="tick.y2.toFixed(1)"
                :stroke="tick.major ? 'rgba(168,216,255,0.4)' : 'rgba(168,216,255,0.15)'"
                :stroke-width="tick.major ? 1.5 : 0.8"
              />
            </g>
            <!-- Subsystem arcs -->
            <path
              v-for="(sub, i) in subsystems"
              :key="sub.name"
              :d="arcPath(i, sub.tone)"
              :fill="TONE_COLOR[sub.tone] || '#4b5563'"
              :fill-opacity="0.85"
            />
            <!-- Center glow -->
            <circle cx="60" cy="60" r="38" fill="url(#radarGlow)" />
            <defs>
              <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#0a1a2e" />
                <stop offset="100%" stop-color="#040810" />
              </radialGradient>
            </defs>
            <!-- Health % -->
            <text x="60" y="55" text-anchor="middle" class="ring-pct-text" fill="#e2eaf4" font-size="16" font-weight="700" font-family="Fira Code, monospace">{{ animStarted ? animHealth : overallHealth }}</text>
            <text x="60" y="67" text-anchor="middle" fill="#64748b" font-size="7" font-family="Fira Code, monospace" letter-spacing="1">HEALTH</text>
          </svg>

          <div class="radar-legend">
            <div v-for="sub in subsystems" :key="sub.name" class="radar-legend-item">
              <span class="rli-dot" :style="{ background: TONE_COLOR[sub.tone] }" />
              <span class="rli-name">{{ sub.name }}</span>
              <span class="rli-val">{{ sub.value }}</span>
            </div>
          </div>
        </div>
      </article>

      <!-- B: 30-day Activity Stream -->
      <article class="panel stream-panel entrance-2">
        <div class="panel-cap">
          <span class="cap-label">ACTIVITY STREAM · 30d</span>
          <div class="cap-stats">
            <span class="cap-stat">
              <span class="cs-num">{{ totalSessions }}</span>
              <span class="cs-label">Sessions</span>
            </span>
            <span class="cap-stat">
              <span class="cs-num txt-red">{{ errorDays }}</span>
              <span class="cs-label">Error days</span>
            </span>
            <span class="cap-stat">
              <span class="cs-num">{{ peakDay }}</span>
              <span class="cs-label">Peak date</span>
            </span>
          </div>
        </div>

        <div class="stream-chart">
          <svg class="chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#67e8f9" stop-opacity="0.3" />
                <stop offset="100%" stop-color="#67e8f9" stop-opacity="0.01" />
              </linearGradient>
            </defs>
            <!-- Grid -->
            <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(168,216,255,0.06)" stroke-width="0.3" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(168,216,255,0.06)" stroke-width="0.3" />
            <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(168,216,255,0.06)" stroke-width="0.3" />
            <!-- Area -->
            <path v-if="areaPathD" :d="areaPathD" fill="url(#chartGrad)" />
            <!-- Line -->
            <path v-if="linePathD" :d="linePathD" fill="none" stroke="#67e8f9" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.9" />
            <!-- Error dots -->
            <circle
              v-for="(pt, i) in activityDays.filter(p => p.hasError)"
              :key="i"
              :cx="pt.x.toFixed(1)" :cy="pt.y.toFixed(1)" r="2"
              fill="#f87171" fill-opacity="0.9"
            />
          </svg>
          <div class="chart-ticks">
            <span v-for="tick in chartTicks" :key="tick.date">{{ tick.date?.slice(5) }}</span>
          </div>
        </div>
      </article>

    </section>

    <!-- ═══════════════════════════════════════════════════════ SECOND ROW -->
    <section class="mid-grid">

      <!-- C: Job Queue -->
      <article class="panel job-panel entrance-3">
        <div class="panel-cap">
          <span class="cap-label">MISSION QUEUE</span>
          <span class="cap-badge" :class="failedJobs ? 'red' : runningJobs ? 'green' : 'dim'">
            {{ runningJobs }} RUN
          </span>
        </div>
        <div class="job-list">
          <div v-if="!recentJobs.length" class="empty-state">暂无任务</div>
          <div
            v-for="job in recentJobs"
            :key="job.id"
            class="job-row"
            :class="jobStatus(job)"
          >
            <span class="job-indicator" :class="jobStatus(job)" />
            <div class="job-info">
              <span class="job-name">{{ job.name }}</span>
              <span class="job-schedule">{{ job.schedule || '—' }}</span>
            </div>
            <div class="job-time">
              <span class="job-next">Next: {{ jobNextRun(job) }}</span>
              <span class="job-last">Last: {{ jobLastRun(job) }}</span>
            </div>
          </div>
        </div>
      </article>

      <!-- D: Resource (Token / Skills) -->
      <article class="panel resource-panel entrance-4">
        <div class="panel-cap">
          <span class="cap-label">RESOURCE PULSE</span>
        </div>

        <div class="res-tabs">
          <button
            class="res-tab"
            :class="{ active: resourceTab === 'token' }"
            @click="resourceTab = 'token'"
          >Token 消耗</button>
          <button
            class="res-tab"
            :class="{ active: resourceTab === 'skills' }"
            @click="resourceTab = 'skills'"
          >Skill 调用</button>
        </div>

        <!-- Token tab -->
        <div v-if="resourceTab === 'token'" class="res-body">
          <div class="period-tabs">
            <button :class="{ active: tokenPeriod === 'today' }" @click="tokenPeriod = 'today'">今日</button>
            <button :class="{ active: tokenPeriod === 'week' }" @click="tokenPeriod = 'week'">本周</button>
            <button :class="{ active: tokenPeriod === 'month' }" @click="tokenPeriod = 'month'">本月</button>
          </div>

          <div class="token-main">
            <span class="token-big">{{ fmt(displayedTokenCount) }}</span>
            <span class="token-unit">tokens</span>
          </div>

          <div class="token-breakdown">
            <div class="tk-row">
              <span class="tk-label">Input</span>
              <span class="tk-val">{{ fmt(displayedTokenInput) }}</span>
            </div>
            <div class="tk-row">
              <span class="tk-label">Output</span>
              <span class="tk-val">{{ fmt(displayedTokenOutput) }}</span>
            </div>
            <div class="tk-row">
              <span class="tk-label">Cache</span>
              <span class="tk-val">{{ fmt(usageStore.totalCacheTokens) }}</span>
            </div>
            <div class="tk-row">
              <span class="tk-label">Cost</span>
              <span class="tk-val txt-amber">{{ fmtCost(usageStore.estimatedCost) }}</span>
            </div>
            <div class="tk-row">
              <span class="tk-label">Hit Rate</span>
              <span class="tk-val">{{ usageStore.cacheHitRate == null ? '—' : usageStore.cacheHitRate.toFixed(1) + '%' }}</span>
            </div>
          </div>

          <div class="spark-row">
            <span class="spark-label">近7天</span>
            <div class="spark-bars">
              <div
                v-for="(bar, i) in sparkDays"
                :key="i"
                class="spark-col"
              >
                <span class="spark-bar" :class="{ warn: bar.hasError }" :style="{ height: bar.pct + '%' }" />
              </div>
            </div>
          </div>
        </div>

        <!-- Skills tab -->
        <div v-if="resourceTab === 'skills'" class="res-body">
          <div class="period-tabs">
            <button :class="{ active: skillPeriod === 'today' }" @click="skillPeriod = 'today'">今日</button>
            <button :class="{ active: skillPeriod === 'week' }" @click="skillPeriod = 'week'">本周</button>
            <button :class="{ active: skillPeriod === 'month' }" @click="skillPeriod = 'month'">本月</button>
          </div>

          <div class="skill-summary">
            <div class="ss-cell">
              <span class="ss-num">{{ fmt(skillStats.total) }}</span>
              <span class="ss-label">总调用</span>
            </div>
            <div class="ss-cell">
              <span class="ss-num txt-green">{{ fmt(skillStats.success) }}</span>
              <span class="ss-label">成功</span>
            </div>
            <div class="ss-cell">
              <span class="ss-num txt-red">{{ fmt(skillStats.failed) }}</span>
              <span class="ss-label">失败</span>
            </div>
          </div>

          <div class="skill-ranking">
            <div class="sr-title">TOP SKILLS</div>
            <div v-if="!topSkills.length" class="empty-state">暂无调用数据</div>
            <div v-for="(sk, i) in topSkills" :key="sk.name" class="sr-row">
              <span class="sr-rank">{{ i + 1 }}</span>
              <span class="sr-name">{{ sk.name }}</span>
              <span class="sr-count">{{ fmt((sk as any).call_count ?? 0) }}</span>
            </div>
          </div>
        </div>
      </article>

      <!-- E: Channels -->
      <article class="panel channel-panel entrance-5">
        <div class="panel-cap">
          <span class="cap-label">CHANNEL STATUS</span>
          <span class="cap-badge" :class="configuredChannels === channels.length && channels.length > 0 ? 'green' : 'amber'">
            {{ configuredChannels }}/{{ channels.length }} CONFIGURED
          </span>
        </div>

        <div class="channel-list">
          <div v-for="ch in channels" :key="ch.name" class="ch-row" :class="ch.configured ? 'online' : 'offline'">
            <span class="ch-icon">{{ ch.icon }}</span>
            <span class="ch-name">{{ ch.name }}</span>
            <span class="ch-status-dot" :class="ch.configured ? 'online' : 'offline'" />
            <span class="ch-status-text">{{ ch.configured ? '已配置' : '未配置' }}</span>
          </div>
        </div>
      </article>

    </section>

    <!-- ═══════════════════════════════════════════════════════ EVENT LOG -->
    <section class="event-log">
      <div class="panel-cap log-cap">
        <span class="cap-label">RECENT EVENTS</span>
        <span class="cap-sub">{{ lastUpdated ? `Updated ${lastUpdated}` : '' }}</span>
      </div>
      <div class="event-strip">
        <div v-for="(ev, i) in recentEvents" :key="i" class="ev-item" :class="ev.type">
          <span class="ev-dot" :class="ev.type" />
          <span class="ev-time">{{ ev.time }}</span>
          <span class="ev-msg">{{ ev.msg }}</span>
        </div>
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════════ ALERTS -->
    <div v-if="loadError" class="alert-bar amber">
      <span class="ab-dot" />
      <span>{{ loadError }}</span>
    </div>

  </section>
</template>

<style scoped lang="scss">
// ─── Color Tokens ──────────────────────────────────────────────────────────
$bg-0: #020509;
$bg-1: #040810;
$bg-2: #070d1a;
$bg-panel: rgba(6, 11, 22, 0.94);
$bg-panel-light: rgba(8, 15, 30, 0.88);
$border: rgba(168, 216, 255, 0.08);
$border-bright: rgba(168, 216, 255, 0.18);

$cyan: #67e8f9;
$cyan-dim: rgba(103, 232, 249, 0.6);
$blue: #a8d8ff;
$green: #4ade80;
$amber: #fbbf24;
$red: #f87171;
$purple: #c4b5fd;

$text-primary: #e2eaf4;
$text-secondary: #7a9cbf;
$text-dim: #3d5a80;

// ─── Base ──────────────────────────────────────────────────────────────────
.cc-view {
  min-height: calc(100 * var(--vh));
  padding: 14px 18px 18px;
  background:
    radial-gradient(ellipse 80% 50% at 8% 4%, rgba(103, 232, 249, 0.07), transparent 55%),
    radial-gradient(ellipse 60% 40% at 90% 15%, rgba(74, 222, 128, 0.05), transparent 50%),
    radial-gradient(ellipse 50% 60% at 50% 100%, rgba(168, 216, 255, 0.04), transparent 45%),
    linear-gradient(160deg, #020509 0%, #050a14 40%, #030810 100%);
  color: $text-primary;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden auto;
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
}

// ─── Top Bar ────────────────────────────────────────────────────────────────
.topbar {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 10px 16px;
  background: $bg-panel;
  border: 1px solid $border;
  border-radius: 18px;
  flex-shrink: 0;
  backdrop-filter: blur(24px);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: 17px;
    border-top: 1px solid rgba(168, 216, 255, 0.06);
    pointer-events: none;
  }

  &::after {
    content: '';
    position: absolute;
    left: 20px;
    right: 20px;
    top: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(103, 232, 249, 0.2), transparent);
    pointer-events: none;
  }
}

.topbar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-right: 16px;
  flex-shrink: 0;
}

.brand-glyph {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(103, 232, 249, 0.2), rgba(103, 232, 249, 0.05));
  border: 1px solid rgba(103, 232, 249, 0.3);
  display: grid;
  place-items: center;
  font-size: 16px;
  font-weight: 700;
  color: $cyan;
  text-shadow: 0 0 16px rgba(103, 232, 249, 0.9), 0 0 32px rgba(103, 232, 249, 0.4);
  box-shadow: 0 0 14px rgba(103, 232, 249, 0.3), inset 0 1px 0 rgba(255,255,255,0.1);
  flex-shrink: 0;
}

.brand-text {
  display: grid;
  gap: 1px;
}

.brand-name {
  font-size: 13px;
  font-weight: 700;
  color: $text-primary;
  letter-spacing: 0.04em;
}

.brand-sub {
  font-size: 9px;
  color: $text-dim;
  letter-spacing: 0.18em;
}

.topbar-metrics {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 1;
  flex-wrap: wrap;
}

.tm-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 4px 12px;

  &.alert .tm-value { color: $red; }
}

.tm-label {
  font-size: 9px;
  color: $text-dim;
  letter-spacing: 0.14em;
}

.tm-value {
  font-size: 11px;
  color: $text-primary;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;

  &.model {
    color: $blue;
    font-size: 10px;
  }
}

.tm-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;

  &.live {
    background: $green;
    box-shadow: 0 0 6px rgba($green, 0.9);
  }
  &.dead {
    background: $red;
    box-shadow: 0 0 6px rgba($red, 0.9);
  }
}

.tm-sep {
  width: 1px;
  height: 28px;
  background: rgba(168, 216, 255, 0.06);
  flex-shrink: 0;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: 12px;
  flex-shrink: 0;
}

.clock {
  display: grid;
  gap: 1px;
  text-align: right;
}

.clock-time {
  font-size: 13px;
  color: $text-primary;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 12px rgba(103, 232, 249, 0.3);
}

.clock-date {
  font-size: 9px;
  color: $text-dim;
  letter-spacing: 0.08em;
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: $text-dim;

  &.pulse {
    background: $green;
    box-shadow: 0 0 10px rgba($green, 0.8);
    animation: breathe 2.4s ease-in-out infinite;
  }
}

@keyframes breathe {
  0%, 100% { box-shadow: 0 0 6px rgba($green, 0.6); opacity: 1; }
  50% { box-shadow: 0 0 14px rgba($green, 1); opacity: 0.75; }
}

// ─── Panel Entrance Animations ───────────────────────────────────────────────
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}

.panel {
  &.entrance-1 { animation: fadeSlideIn 480ms cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 60ms; }
  &.entrance-2 { animation: fadeSlideIn 480ms cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 140ms; }
  &.entrance-3 { animation: fadeSlideIn 480ms cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 220ms; }
  &.entrance-4 { animation: fadeSlideIn 480ms cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 300ms; }
  &.entrance-5 { animation: fadeSlideIn 480ms cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 380ms; }
}

// ─── Panel Base ─────────────────────────────────────────────────────────────
.panel {
  background: $bg-panel;
  border: 1px solid $border;
  border-radius: 20px;
  backdrop-filter: blur(22px);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 200ms ease, border-color 200ms ease, box-shadow 200ms ease;

  &:hover {
    transform: translateY(-2px);
    border-color: rgba(168, 216, 255, 0.18);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(168, 216, 255, 0.06);
  }

  &::after {
    content: '';
    position: absolute;
    left: 16px;
    right: 16px;
    top: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(168, 216, 255, 0.18), transparent);
    pointer-events: none;
  }
}

.panel-cap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 0;
  flex-shrink: 0;
}

.cap-label {
  color: $cyan-dim;
  font-size: 9px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.cap-badge {
  font-size: 9px;
  letter-spacing: 0.1em;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid;
  background: rgba(0,0,0,0.3);

  &.green { color: $green; border-color: rgba($green, 0.35); }
  &.amber, &.yellow { color: $amber; border-color: rgba($amber, 0.35); }
  &.red { color: $red; border-color: rgba($red, 0.35); }
  &.dim { color: $text-dim; border-color: rgba($text-dim, 0.25); }
}

.cap-sub {
  font-size: 9px;
  color: $text-dim;
}

.cap-stats {
  display: flex;
  gap: 12px;
}

.cap-stat {
  display: grid;
  gap: 1px;
  text-align: right;
}

.cs-num {
  font-size: 11px;
  color: $text-primary;
  font-variant-numeric: tabular-nums;
}

.cs-label {
  font-size: 8px;
  color: $text-dim;
  letter-spacing: 0.08em;
}

// ─── Hero Grid ───────────────────────────────────────────────────────────────
.hero-grid {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 12px;
  min-height: 220px;
}

// ─── Radar Panel ─────────────────────────────────────────────────────────────
.radar-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 14px 12px;
  gap: 10px;
}

.radar-svg {
  width: 180px;
  height: 180px;
  flex-shrink: 0;
}

.ring-pct-text {
  font-family: 'Fira Code', monospace;
  animation: textBreathe 3s ease-in-out infinite;
}

@keyframes textBreathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

.radar-legend {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
}

.radar-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 8px;
  background: rgba(0,0,0,0.25);
  border: 1px solid rgba(168, 216, 255, 0.05);
  font-size: 10px;
}

.rli-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.rli-name {
  color: $text-secondary;
  flex: 1;
}

.rli-val {
  color: $text-dim;
  font-size: 9px;
}

// ─── Stream Panel ────────────────────────────────────────────────────────────
.stream-chart {
  flex: 1;
  position: relative;
  padding: 6px 14px 28px;
  min-height: 0;
}

.chart-svg {
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 6px 14px 28px;
}

.chart-ticks {
  position: absolute;
  bottom: 6px;
  left: 14px;
  right: 14px;
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: $text-dim;
  font-variant-numeric: tabular-nums;
}

// ─── Mid Grid ───────────────────────────────────────────────────────────────
.mid-grid {
  display: grid;
  grid-template-columns: 1fr 1.4fr 1fr;
  gap: 12px;
  min-height: 0;
}

// ─── Job Panel ───────────────────────────────────────────────────────────────
.job-list {
  flex: 1;
  overflow: hidden;
  padding: 8px 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.job-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(168, 216, 255, 0.04);
  min-height: 0;
  transition: background 150ms ease, transform 150ms ease, border-color 150ms ease;

  &:hover {
    background: rgba(0, 0, 0, 0.5);
    transform: translateX(2px);
    border-color: rgba(168, 216, 255, 0.1);
  }

  &.running { border-color: rgba($green, 0.15); }
  &.paused { opacity: 0.65; }
  &.bad { border-color: rgba($red, 0.2); background: rgba($red, 0.06); }
}

.job-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;

  &.running { background: $green; box-shadow: 0 0 8px rgba($green, 0.9), 0 0 16px rgba($green, 0.4); }
  &.paused { background: $text-dim; }
  &.bad { background: $red; box-shadow: 0 0 8px rgba($red, 0.9), 0 0 16px rgba($red, 0.4); animation: blink 1.8s ease-in-out infinite; }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.job-info {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 1px;
}

.job-name {
  font-size: 10px;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.job-schedule {
  font-size: 9px;
  color: $text-dim;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.job-time {
  display: grid;
  gap: 1px;
  text-align: right;
  flex-shrink: 0;
}

.job-next, .job-last {
  font-size: 9px;
  color: $text-dim;
  white-space: nowrap;
}

// ─── Resource Panel ───────────────────────────────────────────────────────────
.res-tabs {
  display: flex;
  gap: 2px;
  padding: 8px 12px 0;
  flex-shrink: 0;
}

.res-tab {
  flex: 1;
  padding: 5px 8px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: $text-dim;
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
  transition: all 120ms ease;
  letter-spacing: 0.04em;

  &.active {
    background: rgba(103, 232, 249, 0.1);
    border-color: rgba(103, 232, 249, 0.2);
    color: $cyan;
  }

  &:hover:not(.active) {
    background: rgba(168, 216, 255, 0.05);
    color: $text-secondary;
  }
}

.res-body {
  flex: 1;
  padding: 8px 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.period-tabs {
  display: flex;
  gap: 4px;

  button {
    flex: 1;
    padding: 4px;
    border-radius: 7px;
    border: 1px solid rgba(168, 216, 255, 0.06);
    background: transparent;
    color: $text-dim;
    font-family: inherit;
    font-size: 9px;
    cursor: pointer;
    transition: all 120ms ease;

    &.active {
      background: rgba(103, 232, 249, 0.08);
      border-color: rgba(103, 232, 249, 0.15);
      color: $cyan;
    }
  }
}

.token-main {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.token-big {
  font-size: 32px;
  font-weight: 700;
  color: $text-primary;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 24px rgba(103, 232, 249, 0.4), 0 0 48px rgba(103, 232, 249, 0.15);
}

.token-unit {
  font-size: 10px;
  color: $text-dim;
  letter-spacing: 0.08em;
}

.token-breakdown {
  display: grid;
  gap: 3px;
}

.tk-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 6px;
  border-radius: 6px;
  background: rgba(0,0,0,0.2);
}

.tk-label {
  font-size: 10px;
  color: $text-dim;
}

.tk-val {
  font-size: 10px;
  color: $text-primary;
  font-variant-numeric: tabular-nums;
}

.spark-row {
  display: flex;
  align-items: end;
  gap: 6px;
  margin-top: auto;
}

.spark-label {
  font-size: 9px;
  color: $text-dim;
  flex-shrink: 0;
}

.spark-bars {
  flex: 1;
  display: flex;
  align-items: end;
  gap: 3px;
  height: 36px;
}

.spark-col {
  flex: 1;
  display: flex;
  align-items: end;
  height: 100%;
}

.spark-bar {
  width: 100%;
  border-radius: 3px 3px 0 0;
  background: rgba(103, 232, 249, 0.55);
  min-height: 3px;
  transition: opacity 120ms;

  &.warn { background: rgba($red, 0.7); }

  .spark-col:hover & { opacity: 0.4; }
}

// ─── Skills Tab ─────────────────────────────────────────────────────────────
.skill-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.ss-cell {
  display: grid;
  gap: 2px;
  padding: 8px;
  border-radius: 10px;
  background: rgba(0,0,0,0.25);
  border: 1px solid rgba(168, 216, 255, 0.05);
  text-align: center;
}

.ss-num {
  font-size: 16px;
  font-weight: 700;
  color: $text-primary;
  font-variant-numeric: tabular-nums;
}

.ss-label {
  font-size: 8px;
  color: $text-dim;
  letter-spacing: 0.1em;
}

.skill-ranking {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow: hidden;
}

.sr-title {
  font-size: 8px;
  color: $text-dim;
  letter-spacing: 0.18em;
  padding: 0 2px;
}

.sr-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 6px;
  border-radius: 7px;
  background: rgba(0,0,0,0.2);
}

.sr-rank {
  font-size: 9px;
  color: $text-dim;
  width: 12px;
  text-align: center;
  flex-shrink: 0;
}

.sr-name {
  flex: 1;
  font-size: 10px;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sr-count {
  font-size: 10px;
  color: $cyan;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

// ─── Channel Panel ──────────────────────────────────────────────────────────
.channel-list {
  flex: 1;
  padding: 8px 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow: hidden;
}

.ch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 10px;
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(168, 216, 255, 0.04);

  &.online { border-color: rgba($green, 0.12); }
  &.offline { opacity: 0.5; }
}

.ch-icon {
  width: 26px;
  height: 22px;
  border-radius: 5px;
  background: rgba(168, 216, 255, 0.08);
  border: 1px solid rgba(168, 216, 255, 0.1);
  display: grid;
  place-items: center;
  font-size: 8px;
  color: $text-secondary;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.ch-name {
  flex: 1;
  font-size: 10px;
  color: $text-primary;
}

.ch-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;

  &.online { background: $green; box-shadow: 0 0 6px rgba($green, 0.9); }
  &.offline { background: $text-dim; }
  &:not(.online):not(.offline) { background: $amber; }
}

.ch-status-text {
  font-size: 9px;
  color: $text-dim;
}

// ─── Event Log ───────────────────────────────────────────────────────────────
.event-log {
  background: $bg-panel;
  border: 1px solid $border;
  border-radius: 18px;
  backdrop-filter: blur(22px);
  overflow: hidden;
  flex-shrink: 0;
}

.log-cap {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(168, 216, 255, 0.05);
}

.event-strip {
  display: flex;
  gap: 0;
  overflow-x: auto;
  padding: 8px 14px;
  scrollbar-width: thin;
  scrollbar-color: rgba(168, 216, 255, 0.1) transparent;

  &::-webkit-scrollbar { height: 3px; }
  &::-webkit-scrollbar-thumb { background: rgba(168, 216, 255, 0.12); border-radius: 999px; }
}

.ev-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  border-radius: 9px;
  border: 1px solid transparent;
  flex-shrink: 0;
  white-space: nowrap;

  &.info {
    color: $text-secondary;
    background: rgba(168, 216, 255, 0.04);
    border-color: rgba(168, 216, 255, 0.06);
  }
  &.success {
    color: $green;
    background: rgba($green, 0.06);
    border-color: rgba($green, 0.15);
  }
  &.warn {
    color: $amber;
    background: rgba($amber, 0.07);
    border-color: rgba($amber, 0.18);
  }
  &.error {
    color: $red;
    background: rgba($red, 0.08);
    border-color: rgba($red, 0.2);
  }
}

.ev-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;

  &.info { background: $text-dim; }
  &.success { background: $green; }
  &.warn { background: $amber; }
  &.error { background: $red; }
}

.ev-time {
  font-size: 9px;
  color: inherit;
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
}

.ev-msg {
  font-size: 10px;
}

// ─── Alert Bar ───────────────────────────────────────────────────────────────
.alert-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border-radius: 12px;
  border: 1px solid;
  font-size: 11px;
  flex-shrink: 0;

  &.amber {
    border-color: rgba($amber, 0.3);
    background: rgba($amber, 0.07);
    color: $amber;
  }
}

.ab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: $amber;
  flex-shrink: 0;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
.txt-cyan { color: $cyan; }
.txt-green { color: $green; }
.txt-amber, .txt-red { color: $amber; }
.txt-red { color: $red; }
.txt-sep { color: $text-dim; }
.txt-dim { color: $text-dim; }

.empty-state {
  text-align: center;
  color: $text-dim;
  font-size: 10px;
  padding: 16px 0;
}

// ─── Hover ──────────────────────────────────────────────────────────────────
.job-row, .ch-row, .radar-legend-item, .sr-row, .tk-row, .ss-cell {
  transition: background 120ms ease, border-color 120ms ease;
}

.job-row:hover { background: rgba(6, 11, 22, 0.8) !important; }
.ch-row:hover { background: rgba(6, 11, 22, 0.8) !important; }
.radar-legend-item:hover { background: rgba(0, 0, 0, 0.4) !important; }
.sr-row:hover { background: rgba(0,0,0,0.35) !important; }
.tk-row:hover { background: rgba(0,0,0,0.35) !important; }

// ─── Responsive ──────────────────────────────────────────────────────────────
@media (max-width: 1200px) {
  .mid-grid {
    grid-template-columns: 1fr 1fr;
  }
  .channel-panel {
    grid-column: span 2;
  }
}

@media (max-width: 900px) {
  .hero-grid {
    grid-template-columns: 1fr;
  }
  .topbar {
    flex-wrap: wrap;
    gap: 8px;
  }
  .mid-grid {
    grid-template-columns: 1fr;
  }
  .channel-panel {
    grid-column: span 1;
  }
}
</style>
