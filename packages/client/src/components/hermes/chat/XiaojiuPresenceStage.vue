<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { useAppStore } from '@/stores/hermes/app'

const chatStore = useChatStore()
const appStore = useAppStore()

const altAssetBase = '/xiaojiu-presence'

const presenceState = computed(() => {
  if (chatStore.isStreaming) return 'thinking'
  if (!appStore.connected) return 'offline'
  return 'listening'
})

const stateLabel = computed(() => {
  if (presenceState.value === 'thinking') return '正在思考'
  if (presenceState.value === 'offline') return '链路离线'
  return '安静在线'
})

// 会话窗口使用 OpenRoom Shell 里的 video chat 小卡片资源。
// 这是 Shell.tsx 的 VIDEO_WALLPAPER，不是 characterManager 里同一套 Aoi emotion_videos。
const characterVideo = computed(() => `${altAssetBase}/openroom-video-chat-card.mp4`)

const activeTitle = computed(() => chatStore.activeSession?.title || '新的对话')
</script>

<template>
  <section class="xiaojiu-presence-stage" :class="presenceState">
    <div class="stage-grid" />
    <div class="presence-copy">
      <p class="stage-kicker">XIAOJIU PRESENCE</p>
      <h2>小九在场</h2>
      <p>{{ activeTitle }}</p>
      <div class="presence-tags">
        <span>OpenRoom video chat card</span>
        <span>{{ stateLabel }}</span>
      </div>
    </div>

    <div class="character-zone" aria-label="小九虚拟人物区域">
      <div class="halo halo-one" />
      <div class="halo halo-two" />
      <div class="character-aura" />
      <figure class="character-frame">
        <video
          class="character-video"
          :src="characterVideo"
          autoplay
          muted
          loop
          playsinline
          poster="/xiaojiu-presence/openroom/base.png"
        />
      </figure>
      <div class="floor-glow" />
    </div>

    <div class="presence-footer">
      <span class="status-dot" />
      <strong>{{ stateLabel }}</strong>
      <small>{{ appStore.selectedModel || 'model pending' }}</small>
      <img src="/xiaojiu-presence/openroom/head.png" alt="小九头像" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.xiaojiu-presence-stage {
  position: relative;
  min-height: 360px;
  display: grid;
  grid-template-columns: minmax(190px, 0.8fr) minmax(320px, 1.1fr) minmax(160px, 0.55fr);
  align-items: center;
  gap: 18px;
  margin: 18px;
  padding: 24px;
  border: 1px solid rgba(99, 231, 255, 0.24);
  border-radius: 30px;
  overflow: hidden;
  color: #f8fafc;
  background:
    radial-gradient(circle at 50% 20%, rgba(99, 231, 255, 0.14), transparent 32%),
    radial-gradient(circle at 80% 8%, rgba(169, 140, 255, 0.14), transparent 28%),
    linear-gradient(135deg, rgba(8, 15, 29, 0.9), rgba(2, 6, 23, 0.72));
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.stage-grid {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(99, 231, 255, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99, 231, 255, 0.09) 1px, transparent 1px);
  background-size: 34px 34px;
  mask-image: radial-gradient(circle at center, black, transparent 82%);
}

.presence-copy,
.character-zone,
.presence-footer {
  position: relative;
  z-index: 1;
}

.stage-kicker {
  margin: 0 0 8px;
  color: #63e7ff;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  letter-spacing: 0.16em;
}

.presence-copy h2 {
  margin: 0;
  font-size: clamp(34px, 4vw, 66px);
  line-height: 0.95;
  letter-spacing: -1.8px;
}

.presence-copy p:last-of-type {
  max-width: 280px;
  margin: 12px 0 0;
  color: #b9c9de;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.presence-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 16px;

  span {
    padding: 7px 10px;
    border: 1px solid rgba(99, 231, 255, 0.16);
    border-radius: 999px;
    color: #b9c9de;
    background: rgba(3, 8, 19, 0.48);
    font-family: 'Fira Code', monospace;
    font-size: 10px;
  }
}

.character-zone {
  min-height: 320px;
  display: grid;
  place-items: center;
}

.halo {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(99, 231, 255, 0.22);

  &.halo-one {
    width: 292px;
    height: 292px;
    animation: spin 18s linear infinite;
    border-top-color: rgba(99, 231, 255, 0.9);
  }

  &.halo-two {
    width: 214px;
    height: 214px;
    animation: spin 12s linear reverse infinite;
    border-right-color: rgba(169, 140, 255, 0.72);
  }
}

.character-aura {
  position: absolute;
  width: 330px;
  height: 330px;
  border-radius: 50%;
  background:
    radial-gradient(circle, rgba(99, 231, 255, 0.2), transparent 58%),
    conic-gradient(from 120deg, rgba(99, 231, 255, 0.26), transparent, rgba(169, 140, 255, 0.22), transparent);
  filter: blur(2px);
  opacity: 0.72;
}

.character-frame {
  position: relative;
  width: 230px;
  height: 322px;
  margin: 0;
  overflow: hidden;
  background: transparent;
  border: 0;
  border-radius: 18px;
  box-shadow: none;
}

.character-video {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  width: 230px;
  height: 322px;
  object-fit: cover;
  object-position: center center;
  transform: translate(-50%, -50%);
  filter:
    saturate(1.08)
    contrast(1.05)
    drop-shadow(0 0 22px rgba(99, 231, 255, 0.24))
    drop-shadow(0 28px 48px rgba(0, 0, 0, 0.42));
}

.character-frame::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(2, 6, 23, 0.02) 0%, transparent 58%, rgba(3, 6, 17, 0.3) 100%);
}

.thinking .character-video {
  transform: translate(-50%, -50%) scale(1.02);
  filter:
    saturate(1.16)
    contrast(1.08)
    drop-shadow(0 0 26px rgba(169, 140, 255, 0.32))
    drop-shadow(0 30px 54px rgba(0, 0, 0, 0.46));
}

.floor-glow {
  position: absolute;
  bottom: 10px;
  width: 280px;
  height: 34px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(99, 231, 255, 0.26), transparent 68%);
  filter: blur(1px);
}

.presence-footer {
  justify-self: end;
  min-width: 150px;
  padding: 14px;
  border: 1px solid rgba(99, 231, 255, 0.16);
  border-radius: 20px;
  background: rgba(2, 6, 23, 0.52);

  strong,
  small {
    display: block;
  }

  strong {
    margin: 8px 0 4px;
  }

  small {
    max-width: 150px;
    color: #7f90aa;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  img {
    width: 56px;
    height: 56px;
    margin-top: 14px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid rgba(99, 231, 255, 0.24);
  }
}

.status-dot {
  display: block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #63e7ff;
  box-shadow: 0 0 18px rgba(99, 231, 255, 0.9);
}

.xiaojiu-presence-stage.thinking .character-frame {
  animation: breathe 1.8s ease-in-out infinite;
}

.xiaojiu-presence-stage.offline .status-dot {
  background: #ef4444;
  box-shadow: 0 0 18px rgba(239, 68, 68, 0.8);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes breathe {
  50% { transform: translateY(-4px) scale(1.015); }
}

@media (max-width: 1180px) {
  .xiaojiu-presence-stage {
    grid-template-columns: 1fr;
    min-height: 520px;
  }

  .presence-footer {
    justify-self: stretch;
  }
}
</style>
