<script setup lang="ts">
import { computed } from 'vue'
import { NDrawer, NDrawerContent, NTabs, NTabPane, NButton } from 'naive-ui'
import { useRouter } from 'vue-router'

const props = withDefaults(defineProps<{
  show: boolean
  activeTab?: 'terminal' | 'files'
}>(), {
  activeTab: 'files',
})

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const router = useRouter()

const visible = computed({
  get: () => props.show,
  set: (value: boolean) => emit('update:show', value),
})

function openRoute(name: 'hermes.files' | 'hermes.terminal') {
  visible.value = false
  router.push({ name })
}
</script>

<template>
  <NDrawer v-model:show="visible" placement="right" :width="360">
    <NDrawerContent title="快捷工作舱" closable>
      <NTabs :default-value="activeTab" type="line" animated>
        <NTabPane name="files" tab="文件舱">
          <div class="drawer-pane">
            <p class="pane-kicker">FILES</p>
            <h3>打开文件管理</h3>
            <p>进入完整文件舱，浏览、编辑和上传工作区文件。</p>
            <NButton type="primary" block @click="openRoute('hermes.files')">
              进入文件舱
            </NButton>
          </div>
        </NTabPane>
        <NTabPane name="terminal" tab="执行终端">
          <div class="drawer-pane">
            <p class="pane-kicker">TERMINAL</p>
            <h3>打开执行终端</h3>
            <p>进入完整终端模块，查看或执行命令。</p>
            <NButton type="primary" block @click="openRoute('hermes.terminal')">
              进入执行终端
            </NButton>
          </div>
        </NTabPane>
      </NTabs>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped lang="scss">
.drawer-pane {
  display: grid;
  gap: 12px;
  padding: 8px 2px 4px;
  color: var(--text-secondary);
}

.pane-kicker {
  margin: 0;
  font: 700 11px/1 'Fira Code', monospace;
  letter-spacing: 0.16em;
  color: #63e7ff;
}

h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
}

p {
  margin: 0;
  line-height: 1.6;
}
</style>
