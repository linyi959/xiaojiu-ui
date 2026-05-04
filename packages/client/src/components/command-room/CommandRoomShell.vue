<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/hermes/app'
import { useChatStore } from '@/stores/hermes/chat'
import CommandModuleRail from './CommandModuleRail.vue'
import CommandStageFrame from './CommandStageFrame.vue'
import XiaojiuPresenceDock from './XiaojiuPresenceDock.vue'

const appStore = useAppStore()
const chatStore = useChatStore()
const { connected } = storeToRefs(appStore)
const { isStreaming } = storeToRefs(chatStore)

// Shell 级 mood：决定外缘光、整体氛围
// 与 PresenceDock 的 mood 保持一致
const shellMood = computed<'offline' | 'thinking' | 'idle'>(() => {
  if (!connected.value) return 'offline'
  if (isStreaming.value) return 'thinking'
  return 'idle'
})
</script>

<template>
  <div class="command-room-shell" :data-mood="shellMood" :class="{ 'is-streaming': isStreaming, 'is-offline': !connected }">
    <CommandModuleRail />
    <CommandStageFrame>
      <slot />
    </CommandStageFrame>
    <XiaojiuPresenceDock />
    <div class="shell-aura" aria-hidden="true" />
  </div>
</template>

<style scoped lang="scss">
.command-room-shell {
  position: relative;
  display: flex;
  width: 100vw;
  height: calc(100 * var(--vh));
  overflow: hidden;
  background:
    radial-gradient(circle at 18% 0%, rgba(99, 231, 255, 0.07), transparent 28%),
    linear-gradient(135deg, #02040b 0%, #07101f 52%, #02040b 100%);
  transition: background 0.6s ease;
}

/* 顶部一层呼吸光晕：根据 mood 切色 */
.shell-aura {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.45;
  background:
    radial-gradient(60% 35% at 50% 0%, rgba(99, 231, 255, 0.08), transparent 70%);
  transition: opacity 0.6s ease, background 0.6s ease;
}

/* mood 切换：thinking 偏紫蓝、流动 */
.command-room-shell[data-mood='thinking'] .shell-aura {
  opacity: 0.85;
  background:
    radial-gradient(60% 35% at 50% 0%, rgba(169, 140, 255, 0.18), transparent 70%),
    radial-gradient(40% 28% at 80% 8%, rgba(99, 231, 255, 0.14), transparent 70%);
  animation: shell-aura-flow 6s ease-in-out infinite;
}

/* mood: offline 偏暗红警示，但克制 */
.command-room-shell[data-mood='offline'] .shell-aura {
  opacity: 0.65;
  background:
    radial-gradient(60% 35% at 50% 0%, rgba(255, 107, 138, 0.12), transparent 70%);
}

/* streaming 时整体外缘有一圈细微的"呼吸边光" */
.command-room-shell.is-streaming::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  border: 1px solid rgba(99, 231, 255, 0.18);
  box-shadow:
    inset 0 0 32px rgba(99, 231, 255, 0.12),
    inset 0 0 96px rgba(169, 140, 255, 0.08);
  animation: shell-edge-breathe 3.6s ease-in-out infinite;
}

@keyframes shell-aura-flow {
  0%, 100% { transform: translateY(0); opacity: 0.85; }
  50% { transform: translateY(4px); opacity: 1; }
}

@keyframes shell-edge-breathe {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

/* 让子组件浮在 aura 之上 */
.command-room-shell > :not(.shell-aura) {
  position: relative;
  z-index: 2;
}
</style>
