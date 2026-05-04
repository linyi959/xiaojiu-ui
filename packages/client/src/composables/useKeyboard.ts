import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/hermes/chat'
import { useSessionSearch } from './useSessionSearch'
import { useCommandPalette } from './useCommandPalette'

export function useKeyboard() {
  const router = useRouter()
  const chatStore = useChatStore()
  const { sessionSearchOpen, openSessionSearch, closeSessionSearch } = useSessionSearch()
  const { isOpen: paletteOpen, open: openPalette, close: closePalette } = useCommandPalette()

  function handleKeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey

    if (mod && e.key === 'n') {
      e.preventDefault()
      chatStore.newChat()
      return
    }

    if (mod && e.key === 'j') {
      e.preventDefault()
      router.push({ name: 'hermes.jobs' })
      return
    }

    // ⌘K / Ctrl-K → 小九中枢指令面板（全局入口）
    if (mod && e.key.toLowerCase() === 'k') {
      if (router.currentRoute.value.name === 'login') return
      e.preventDefault()
      openPalette()
      return
    }

    // ⌘P / Ctrl-P → 会话搜索（Mac 习惯：Quick Open）
    if (mod && e.key.toLowerCase() === 'p') {
      if (router.currentRoute.value.name === 'login') return
      e.preventDefault()
      openSessionSearch()
      return
    }

    if (e.key === 'Escape') {
      if (paletteOpen.value) {
        e.preventDefault()
        closePalette()
        return
      }
      if (sessionSearchOpen.value) {
        e.preventDefault()
        closeSessionSearch()
        return
      }
      // Close any open modals — naive-ui handles this internally
      const modal = document.querySelector('.n-modal-mask')
      if (modal) {
        const closeBtn = modal.querySelector('.n-base-close') as HTMLElement
        closeBtn?.click()
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
}
