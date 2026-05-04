<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/hermes/app'
import { useJobsStore } from '@/stores/hermes/jobs'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const jobsStore = useJobsStore()

const quickItems = [
  { key: 'hermes.monitor', label: '监控', path: '/hermes/monitor', code: 'MON' },
  { key: 'hermes.chat', label: '对话', path: '/hermes/chat', code: 'CHAT' },
  { key: 'hermes.terminal', label: '终端', path: '/hermes/terminal', code: 'TERM' },
  { key: 'hermes.files', label: '文件', path: '/hermes/files', code: 'FILE' },
  { key: 'hermes.memory', label: '记忆', path: '/hermes/memory', code: 'MEM' },
  { key: 'hermes.skills', label: '技能', path: '/hermes/skills', code: 'SKL' },
  { key: 'hermes.settings', label: '设置', path: '/hermes/settings', code: 'SET' },
]

const runningJobs = computed(() => jobsStore.jobs.filter(job => job.enabled && !job.paused_at).length)
const totalModels = computed(() => appStore.modelGroups.reduce((sum, group) => sum + group.models.length, 0))
const compactModel = computed(() => appStore.selectedModel || '未加载模型')
const provider = computed(() => appStore.selectedProvider || 'default')

function go(path: string) {
  router.push(path)
}
</script>

<template>
  <aside class="system-rail" aria-label="小九中枢组件状态栏">
    <div class="rail-presence" :class="{ online: appStore.connected }">
      <img src="/logo.png?v=xiaojiu-20260504" alt="小九中枢" />
      <div>
        <strong>小九</strong>
        <span>{{ appStore.connected ? '在线' : '离线' }}</span>
      </div>
    </div>

    <section class="rail-section">
      <p>快捷组件</p>
      <button
        v-for="item in quickItems"
        :key="item.key"
        class="rail-module"
        :class="{ active: route.name === item.key }"
        type="button"
        @click="go(item.path)"
      >
        <span class="module-code">{{ item.code }}</span>
        <span class="module-label">{{ item.label }}</span>
      </button>
    </section>

    <section class="rail-section status-cards">
      <p>运行状态</p>
      <div class="status-card">
        <span>MODEL</span>
        <strong>{{ compactModel }}</strong>
        <small>{{ provider }}</small>
      </div>
      <div class="status-card">
        <span>PROVIDERS</span>
        <strong>{{ appStore.modelGroups.length }}</strong>
        <small>{{ totalModels }} models</small>
      </div>
      <div class="status-card">
        <span>JOBS</span>
        <strong>{{ runningJobs }}</strong>
        <small>active tasks</small>
      </div>
    </section>
  </aside>
</template>

<style scoped lang="scss">
.system-rail {
  width: 220px;
  height: calc(100 * var(--vh));
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 12px;
  border-left: 1px solid rgba(51, 65, 85, 0.58);
  color: #e2e8f0;
  background:
    radial-gradient(circle at 50% 0%, rgba(34, 197, 94, 0.12), transparent 38%),
    linear-gradient(180deg, rgba(2, 6, 23, 0.97), rgba(15, 23, 42, 0.94));
  box-shadow: -18px 0 60px rgba(0, 0, 0, 0.26), inset 1px 0 0 rgba(255, 255, 255, 0.04);
}

.rail-presence {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(51, 65, 85, 0.78);
  border-radius: 22px;
  background: rgba(15, 23, 42, 0.74);

  img {
    width: 42px;
    height: 42px;
    border-radius: 16px;
    object-fit: cover;
    box-shadow: 0 0 24px rgba(34, 197, 94, 0.14);
  }

  strong,
  span {
    display: block;
  }

  strong {
    font-size: 14px;
  }

  span {
    margin-top: 2px;
    color: #ef4444;
    font-size: 12px;
  }

  &.online span {
    color: #22c55e;
  }
}

.rail-section {
  display: grid;
  gap: 8px;

  p {
    margin: 0 0 2px;
    color: #64748b;
    font-family: 'Fira Code', monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
}

.rail-module {
  display: grid;
  grid-template-columns: 46px 1fr;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 8px;
  border: 1px solid rgba(51, 65, 85, 0.74);
  border-radius: 16px;
  color: #94a3b8;
  background: rgba(15, 23, 42, 0.56);
  cursor: pointer;
  text-align: left;
  transition: all 0.18s ease;

  &:hover,
  &:focus-visible {
    color: #e2e8f0;
    border-color: rgba(34, 197, 94, 0.4);
    background: rgba(34, 197, 94, 0.08);
    outline: none;
  }

  &.active {
    color: #bbf7d0;
    border-color: rgba(34, 197, 94, 0.55);
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.16), rgba(56, 189, 248, 0.06));
    box-shadow: 0 10px 30px rgba(34, 197, 94, 0.08);
  }
}

.module-code {
  display: grid;
  place-items: center;
  height: 28px;
  border-radius: 11px;
  color: #bbf7d0;
  background: rgba(2, 6, 23, 0.88);
  font-family: 'Fira Code', monospace;
  font-size: 10px;
}

.module-label {
  font-size: 13px;
}

.status-cards {
  margin-top: auto;
}

.status-card {
  padding: 12px;
  border: 1px solid rgba(51, 65, 85, 0.74);
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.54);

  span,
  strong,
  small {
    display: block;
  }

  span {
    color: #22c55e;
    font-family: 'Fira Code', monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
  }

  strong {
    margin-top: 7px;
    color: #f8fafc;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  small {
    margin-top: 3px;
    color: #64748b;
  }
}

@media (max-width: 1180px) {
  .system-rail {
    width: 84px;
    align-items: center;
  }

  .rail-presence {
    padding: 8px;

    div {
      display: none;
    }
  }

  .rail-section p,
  .module-label,
  .status-card small,
  .status-card span {
    display: none;
  }

  .rail-module {
    width: 52px;
    grid-template-columns: 1fr;
  }

  .status-card {
    width: 52px;
    padding: 10px 6px;
    text-align: center;

    strong {
      font-size: 11px;
    }
  }
}

@media (max-width: 980px) {
  .system-rail {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rail-module {
    transition: none;
  }
}
</style>
