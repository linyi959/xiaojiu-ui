<script setup lang="ts">
import CommandRoomShell from '@/components/command-room/CommandRoomShell.vue'
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <CommandRoomShell>
    <component :is="route.meta?.layout ?? 'div'" class="command-room-content">
      <router-view />
    </component>
  </CommandRoomShell>
</template>

<style scoped lang="scss">
.command-room-content {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}
</style>
