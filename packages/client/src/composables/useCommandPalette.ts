import { ref } from 'vue'

// 全局单例：任何地方都能 open() 打开指令面板
const isOpen = ref(false)
const initialQuery = ref('')

export function useCommandPalette() {
  function open(prefill = '') {
    initialQuery.value = prefill
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
    initialQuery.value = ''
  }

  function toggle() {
    if (isOpen.value) close()
    else open()
  }

  return {
    isOpen,
    initialQuery,
    open,
    close,
    toggle,
  }
}
