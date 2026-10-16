import { useEffect, useRef, type RefObject } from 'react'

/**
 * 弹层无障碍：Escape 关闭 + 焦点陷阱 + 关闭后焦点归还触发元素。
 *
 * 原来的三个 dialog（班次编辑 / 切换用户 / 选择月份）都只有 role="dialog"
 * 和 aria-modal，键盘用户 Tab 会跑到背后的页面里，Escape 也关不掉。
 */
export function useDialog(isOpen: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    returnFocusRef.current = document.activeElement as HTMLElement | null

    const container = containerRef.current
    if (!container) return

    const focusables = () => Array.from(
      container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(element => element.offsetParent !== null || element === document.activeElement)

    // 打开时把焦点送进弹层
    const first = focusables()[0]
    first?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      const items = focusables()
      if (items.length === 0) return

      const head = items[0]
      const tail = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (event.shiftKey && (active === head || !container?.contains(active))) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && active === tail) {
        event.preventDefault()
        head.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      returnFocusRef.current?.focus?.()
    }
  }, [isOpen, onClose])

  return containerRef as RefObject<HTMLElement>
}