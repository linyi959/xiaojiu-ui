<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton } from 'naive-ui'
import { useAppStore } from '@/stores/hermes/app'
import { useJobsStore } from '@/stores/hermes/jobs'
import { checkHealth, type HealthResponse } from '@/api/hermes/system'
import { fetchSkills, fetchMemory, type MemoryData, type SkillCategory, type SkillInfo } from '@/api/hermes/skills'

const { t } = useI18n()
const appStore = useAppStore()
const jobsStore = useJobsStore()

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

const coreStatus = computed(() => appStore.connected ? 'ONLINE' : 'OFFLINE')

const memoryUpdated = computed(() => {
  const times = [memory.value?.memory_mtime, memory.value?.user_mtime, memory.value?.soul_mtime].filter(Boolean) as number[]
  if (!times.length) return '—'
  return new Date(Math.max(...times) * 1000).toLocaleString()
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

async function refreshMonitor() {
  loading.value = true
  loadError.value = ''
  try {
    const [healthRes, skillRes, memoryRes] = await Promise.allSettled([
      checkHealth(),
      fetchSkills(),
      fetchMemory(),
      jobsStore.fetchJobs(),
      appStore.loadModels(),
      appStore.checkConnection(),
    ])

    if (healthRes.status === 'fulfilled') health.value = healthRes.value
    if (skillRes.status === 'fulfilled') skills.value = skillRes.value
    if (memoryRes.status === 'fulfilled') memory.value = memoryRes.value

    const failed = [healthRes, skillRes, memoryRes].filter(result => result.status === 'rejected').length
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

    <header class="monitor-hero">
      <div class="hero-frequency-block">
        <div class="hero-frequency">
          <span v-for="n in 28" :key="n" :style="{ height: `${10 + ((n * 7) % 34)}px` }" />
        </div>
        <p class="hero-meta">最近刷新 · {{ lastUpdated }}</p>
      </div>
      <div class="hero-orbit" aria-hidden="true">
        <div class="orbit-ring ring-one" />
        <div class="orbit-ring ring-two" />
        <div class="orbit-core">九</div>
      </div>
      <div class="hero-actions">
        <div class="heartbeat" :class="{ online: appStore.connected }">
          <span class="pulse-dot" />
          <span>{{ coreStatus }}</span>
        </div>
        <NButton size="small" secondary :loading="loading" @click="refreshMonitor">
          {{ t('monitor.refresh') }}
        </NButton>
      </div>
    </header>

    <div v-if="loadError" class="monitor-warning">{{ loadError }}</div>

    <div class="mission-strip">
      <div class="mission-card">
        <span class="metric-label">Tasks</span>
        <strong>{{ runningJobs }}</strong>
        <small>{{ pausedJobs }} paused · {{ failedJobs }} alerts</small>
      </div>
      <div class="mission-card">
        <span class="metric-label">Skills</span>
        <strong>{{ enabledSkills }}/{{ totalSkills }}</strong>
        <small>capability modules</small>
      </div>
      <div class="mission-card">
        <span class="metric-label">Memory</span>
        <strong>{{ memory ? 'INDEXED' : 'PENDING' }}</strong>
        <small>{{ memoryUpdated }}</small>
      </div>
      <div class="mission-card">
        <span class="metric-label">Subsystems</span>
        <strong>{{ subsystems.filter(s => s.tone === 'good').length }}/{{ subsystems.length }}</strong>
        <small>healthy · v{{ formatVersion() }}</small>
      </div>
    </div>

    <div class="monitor-layout">
      <section class="panel command-map-panel">
        <div class="command-map">
          <div class="map-axis horizontal" />
          <div class="map-axis vertical" />
          <div class="map-node node-core">CORE</div>
          <div class="map-node node-model">MODEL</div>
          <div class="map-node node-memory">MEMORY</div>
          <div class="map-node node-tool">TOOLS</div>
          <div class="map-node node-task">TASKS</div>
        </div>
      </section>

      <section class="panel core-panel">
        <div class="panel-header">
          <div>
            <p class="panel-kicker">LIVE MATRIX</p>
            <h2>{{ t('monitor.coreMatrix') }}</h2>
          </div>
          <span class="timestamp">{{ lastUpdated }}</span>
        </div>

        <div class="subsystem-list">
          <div v-for="item in subsystems" :key="item.name" class="subsystem-row" :class="item.tone">
            <div class="node-mark"><span /></div>
            <div>
              <strong>{{ item.name }}</strong>
              <small>{{ item.value }}</small>
            </div>
            <div class="signal-bars" aria-hidden="true">
              <i /><i /><i /><i />
            </div>
          </div>
        </div>
      </section>

      <section class="panel scan-panel">
        <div class="radar">
          <div class="radar-sweep" />
          <div class="radar-core">九</div>
        </div>
        <h2>{{ t('monitor.presence') }}</h2>
        <p>小九中枢在线。当前框架先接入真实健康检查、模型、任务、记忆和技能状态；后面可以继续把终端、文件、语音、浏览器、工具调用都挂进来。</p>
        <div class="presence-tags">
          <span>listening</span>
          <span>thinking</span>
          <span>acting</span>
        </div>
      </section>

      <section class="panel wide telemetry-panel">
        <div class="panel-header">
          <div>
            <p class="panel-kicker">TELEMETRY</p>
            <h2>{{ t('monitor.telemetry') }}</h2>
          </div>
          <span>v{{ formatVersion() }}</span>
        </div>
        <div class="telemetry-grid">
          <div>
            <span>Node</span>
            <strong>{{ appStore.nodeVersion || '—' }}</strong>
          </div>
          <div>
            <span>Memory Updated</span>
            <strong>{{ memoryUpdated }}</strong>
          </div>
          <div>
            <span>Model Providers</span>
            <strong>{{ appStore.modelGroups.length }}</strong>
          </div>
          <div>
            <span>Skill Categories</span>
            <strong>{{ skillCategoryCount }}</strong>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped lang="scss">
.monitor-view {
  position: relative;
  min-height: calc(100 * var(--vh));
  padding: 28px;
  overflow: hidden;
  color: #f8fafc;
  background:
    linear-gradient(115deg, rgba(2, 6, 23, 0.98), rgba(8, 17, 31, 0.92) 46%, rgba(2, 6, 23, 0.98)),
    radial-gradient(circle at 12% 8%, rgba(34, 197, 94, 0.18), transparent 32%),
    radial-gradient(circle at 82% 12%, rgba(56, 189, 248, 0.16), transparent 28%);
}

.monitor-view::before {
  content: '';
  position: absolute;
  inset: 16px;
  pointer-events: none;
  border: 1px solid rgba(34, 197, 94, 0.18);
  border-radius: 30px;
  box-shadow: inset 0 0 80px rgba(34, 197, 94, 0.035);
}

.monitor-view::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.09;
  background: repeating-linear-gradient(0deg, transparent 0 7px, rgba(226, 232, 240, 0.38) 8px);
}

.monitor-grid-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.22;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.16) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.16) 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: radial-gradient(circle at center, black, transparent 82%);
}

.monitor-hero,
.mission-strip,
.monitor-layout {
  position: relative;
  z-index: 1;
}

.monitor-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  min-height: 220px;
  margin-bottom: 20px;
  padding: 22px;
  border: 1px solid rgba(51, 65, 85, 0.72);
  border-radius: 30px;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.82), rgba(2, 6, 23, 0.58));
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);

  h1 {
    margin: 4px 0 8px;
    font-size: clamp(36px, 5vw, 72px);
    line-height: 0.92;
    letter-spacing: -2.4px;
    text-shadow: 0 0 34px rgba(34, 197, 94, 0.16);
  }
}

.eyebrow,
.panel-kicker,
.metric-label {
  margin: 0;
  color: #63e7ff;
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-shadow: 0 0 10px rgba(99, 231, 255, 0.32);
}

.hero-subtitle {
  max-width: 720px;
  margin: 0;
  color: #94a3b8;
  font-size: 15px;
}

.hero-copy {
  flex: 1;
  min-width: 0;
}

.hero-frequency-block {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 14px;
}

.hero-meta {
  margin: 0;
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(203, 229, 255, 0.62);
}

.hero-frequency {
  display: flex;
  align-items: end;
  gap: 4px;
  height: 52px;
  opacity: 0.78;

  span {
    width: 5px;
    border-radius: 999px;
    background: linear-gradient(180deg, #63e7ff, rgba(77, 141, 255, 0.18));
    box-shadow: 0 0 12px rgba(99, 231, 255, 0.28);
  }
}

.hero-orbit {
  position: relative;
  width: 210px;
  height: 210px;
  flex: 0 0 210px;
  display: grid;
  place-items: center;
}

.orbit-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(34, 197, 94, 0.28);

  &.ring-one {
    inset: 8px;
    animation: sweep 10s linear infinite;
    border-top-color: rgba(34, 197, 94, 0.85);
  }

  &.ring-two {
    inset: 34px;
    animation: sweep 7s linear reverse infinite;
    border-right-color: rgba(56, 189, 248, 0.72);
  }
}

.orbit-core {
  position: relative;
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  border-radius: 34px;
  color: #bbf7d0;
  font-size: 42px;
  border: 1px solid rgba(34, 197, 94, 0.45);
  background: linear-gradient(145deg, rgba(2, 6, 23, 0.96), rgba(22, 101, 52, 0.2));
  box-shadow: 0 0 60px rgba(34, 197, 94, 0.18), inset 0 0 24px rgba(34, 197, 94, 0.1);
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.heartbeat {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid rgba(239, 68, 68, 0.34);
  border-radius: 999px;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.24);
  font-family: 'Fira Code', monospace;
  font-size: 12px;

  &.online {
    color: #bbf7d0;
    border-color: rgba(34, 197, 94, 0.42);
    background: rgba(22, 101, 52, 0.18);
  }
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 18px currentColor;
}

.monitor-warning {
  position: relative;
  z-index: 1;
  margin-bottom: 14px;
  padding: 10px 14px;
  border: 1px solid rgba(251, 191, 36, 0.35);
  border-radius: 14px;
  color: #fde68a;
  background: rgba(120, 53, 15, 0.18);
}

.mission-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.mission-card,
.panel {
  border: 1px solid rgba(51, 65, 85, 0.88);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.82), rgba(2, 6, 23, 0.72));
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(16px);
}

.mission-card {
  min-height: 112px;
  padding: 18px;
  border-radius: 22px;

  &.primary {
    border-color: rgba(34, 197, 94, 0.44);
    box-shadow: 0 24px 80px rgba(34, 197, 94, 0.08);
  }

  strong {
    display: block;
    margin: 12px 0 6px;
    font-family: 'Fira Code', monospace;
    font-size: 24px;
    color: #f8fafc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  small {
    color: #94a3b8;
  }
}

.monitor-layout {
  display: grid;
  grid-template-columns: minmax(300px, 0.95fr) minmax(320px, 1.05fr) minmax(280px, 0.75fr);
  gap: 16px;
}

.panel {
  position: relative;
  border-radius: 26px;
  padding: 20px;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.08), transparent 42%, rgba(56, 189, 248, 0.06));
  }

  &.wide {
    grid-column: 1 / -1;
  }
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;

  h2 {
    margin: 4px 0 0;
    font-size: 18px;
  }

  span {
    color: #64748b;
    font-family: 'Fira Code', monospace;
    font-size: 12px;
  }
}

.subsystem-list {
  display: grid;
  gap: 10px;
}

.subsystem-row {
  display: grid;
  grid-template-columns: 34px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 13px;
  border: 1px solid rgba(51, 65, 85, 0.78);
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.62);

  strong,
  small {
    display: block;
  }

  small {
    color: #94a3b8;
  }

  &.good .node-mark span { background: #22c55e; box-shadow: 0 0 18px rgba(34, 197, 94, 0.75); }
  &.warn .node-mark span { background: #f59e0b; box-shadow: 0 0 18px rgba(245, 158, 11, 0.7); }
  &.bad .node-mark span { background: #ef4444; box-shadow: 0 0 18px rgba(239, 68, 68, 0.7); }
}

.node-mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.9);

  span {
    width: 9px;
    height: 9px;
    border-radius: 999px;
  }
}

.signal-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;

  i {
    width: 4px;
    border-radius: 999px;
    background: #22c55e;
    opacity: 0.78;

    &:nth-child(1) { height: 8px; }
    &:nth-child(2) { height: 13px; }
    &:nth-child(3) { height: 18px; }
    &:nth-child(4) { height: 23px; }
  }
}

.scan-panel {
  text-align: center;

  p {
    color: #94a3b8;
    line-height: 1.7;
  }
}

.radar {
  position: relative;
  display: grid;
  place-items: center;
  width: min(260px, 70vw);
  aspect-ratio: 1;
  margin: 4px auto 18px;
  border: 1px solid rgba(34, 197, 94, 0.32);
  border-radius: 50%;
  background:
    repeating-radial-gradient(circle, transparent 0 34px, rgba(34, 197, 94, 0.16) 35px 36px),
    conic-gradient(from 180deg, rgba(34, 197, 94, 0.1), transparent, rgba(56, 189, 248, 0.12), transparent);
  overflow: hidden;
}

.radar-sweep {
  position: absolute;
  inset: 50% 50% 0 0;
  transform-origin: 100% 0;
  background: linear-gradient(45deg, rgba(34, 197, 94, 0.44), transparent 58%);
  animation: sweep 4.8s linear infinite;
}

.radar-core {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  border-radius: 50%;
  border: 1px solid rgba(34, 197, 94, 0.54);
  color: #bbf7d0;
  font-size: 34px;
  background: rgba(2, 6, 23, 0.82);
  box-shadow: 0 0 38px rgba(34, 197, 94, 0.22);
}

.presence-tags {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;

  span {
    padding: 6px 10px;
    border: 1px solid rgba(56, 189, 248, 0.28);
    border-radius: 999px;
    color: #bae6fd;
    background: rgba(14, 165, 233, 0.09);
    font-family: 'Fira Code', monospace;
    font-size: 11px;
  }
}

.command-map-panel {
  min-height: 360px;
}

.command-map {
  position: relative;
  height: 100%;
  min-height: 320px;
  border-radius: 22px;
  overflow: hidden;
  background:
    radial-gradient(circle at center, rgba(34, 197, 94, 0.18), transparent 28%),
    linear-gradient(rgba(34, 197, 94, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(34, 197, 94, 0.08) 1px, transparent 1px);
  background-size: auto, 28px 28px, 28px 28px;
}

.map-axis {
  position: absolute;
  background: linear-gradient(90deg, transparent, rgba(34, 197, 94, 0.45), transparent);

  &.horizontal {
    left: 8%;
    right: 8%;
    top: 50%;
    height: 1px;
  }

  &.vertical {
    top: 8%;
    bottom: 8%;
    left: 50%;
    width: 1px;
    background: linear-gradient(180deg, transparent, rgba(56, 189, 248, 0.42), transparent);
  }
}

.map-node {
  position: absolute;
  display: grid;
  place-items: center;
  min-width: 72px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid rgba(34, 197, 94, 0.34);
  border-radius: 999px;
  color: #bbf7d0;
  background: rgba(2, 6, 23, 0.84);
  box-shadow: 0 0 28px rgba(34, 197, 94, 0.12);
  font-family: 'Fira Code', monospace;
  font-size: 11px;
}

.node-core { left: 50%; top: 50%; transform: translate(-50%, -50%); color: #f8fafc; border-color: rgba(248, 250, 252, 0.42); }
.node-model { left: 12%; top: 18%; }
.node-memory { right: 10%; top: 24%; }
.node-tool { left: 13%; bottom: 18%; }
.node-task { right: 12%; bottom: 16%; }

.telemetry-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;

  div {
    padding: 15px;
    border: 1px solid rgba(51, 65, 85, 0.72);
    border-radius: 16px;
    background: rgba(15, 23, 42, 0.54);
  }

  span,
  strong {
    display: block;
  }

  span {
    color: #64748b;
    font-size: 12px;
  }

  strong {
    margin-top: 8px;
    color: #e2e8f0;
    font-family: 'Fira Code', monospace;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

@keyframes sweep {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .radar-sweep,
  .orbit-ring { animation: none; }
}

@media (max-width: 1100px) {
  .mission-strip,
  .telemetry-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .monitor-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .monitor-view {
    padding: 18px;
  }

  .monitor-hero {
    flex-direction: column;
  }

  .mission-strip,
  .telemetry-grid {
    grid-template-columns: 1fr;
  }
}
</style>
