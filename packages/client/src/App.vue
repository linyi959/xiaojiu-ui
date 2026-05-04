<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { darkTheme, NConfigProvider, NMessageProvider, NDialogProvider, NNotificationProvider } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { getThemeOverrides } from '@/styles/theme'
import { useTheme } from '@/composables/useTheme'
import { useKeyboard } from '@/composables/useKeyboard'
import { useAppStore } from '@/stores/hermes/app'
import SessionSearchModal from '@/components/hermes/chat/SessionSearchModal.vue'
import CommandRoomShell from '@/components/command-room/CommandRoomShell.vue'
import CommandPalette from '@/components/command-room/CommandPalette.vue'

const { isDark } = useTheme()
const { t } = useI18n()
const appStore = useAppStore()
const route = useRoute()
const router = useRouter()
const ready = ref(false)

const themeOverrides = computed(() => getThemeOverrides(isDark.value))
const naiveTheme = computed(() => isDark.value ? darkTheme : null)

const isLoginPage = computed(() => route.name === 'login')

const nodeVersionLow = computed(() => {
  const v = appStore.nodeVersion
  const major = parseInt(v.split('.')[0], 10)
  return !isNaN(major) && major < 23
})

router.isReady().then(() => {
  ready.value = true
})

onMounted(() => {
  if (!isLoginPage.value) {
    appStore.loadModels()
    appStore.startHealthPolling()
  }
})

onUnmounted(() => {
  appStore.stopHealthPolling()
})

useKeyboard()
</script>

<template>
  <NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <NDialogProvider>
        <NNotificationProvider>
          <div v-if="nodeVersionLow && ready" class="node-warning-bar">
            {{ t('sidebar.nodeVersionWarning', { version: appStore.nodeVersion }) }}
          </div>
          <div v-if="ready" class="app-layout" :class="{ 'no-sidebar': isLoginPage }">
            <template v-if="!isLoginPage">
              <CommandRoomShell>
                <router-view />
              </CommandRoomShell>
            </template>
            <main v-else class="app-main login-main">
              <router-view />
            </main>
          </div>
          <SessionSearchModal />
          <CommandPalette />
        </NNotificationProvider>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.app-layout {
  width: 100vw;
  height: calc(100 * var(--vh));
  overflow: hidden;
  background:
    radial-gradient(circle at 18% 0%, rgba(99, 231, 255, 0.07), transparent 28%),
    linear-gradient(135deg, #02040b 0%, #07101f 52%, #02040b 100%);
}

.login-main {
  width: 100%;
  height: 100%;
}

.node-warning-bar {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 100;
  padding: 4px 16px;
  font-size: 12px;
  font-weight: 500;
  color: #b45309;
  background-color: #fef3c7;
  border-bottom: 1px solid #fde68a;
  text-align: center;
  line-height: 1.4;
}
</style>
