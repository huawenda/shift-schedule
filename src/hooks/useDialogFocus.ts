import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

/**
 * 弹层焦点管理：打开时移入焦点、Tab 在弹层内循环、关闭后把焦点还给触发元素。
 *
 * 为什么必须做：模态弹层不管焦点的话，焦点会留在**打开它的那个按钮**上
 * （点日历格子开弹层，焦点就还在格子上），Tab 还能走到背景的侧栏。
 *
 * 归还焦点时会先给触发元素挂一个 `is-focus-silent`：
 * 按 Esc 关闭属于键盘交互，Chrome 会立刻给背景按钮补上 `:focus-visible` 描边，
 * 看起来像弹层都关了框线还留在格子上。等那个元素失焦后再撤掉这个类。
 */
export function useDialogFocus<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    node.focus({ preventScroll: true })

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !node) return

      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(item => item.getClientRects().length > 0)

      if (items.length === 0) {
        event.preventDefault()
        node.focus({ preventScroll: true })
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    node.addEventListener('keydown', onKeyDown)

    return () => {
      node.removeEventListener('keydown', onKeyDown)
      if (!previous || !document.contains(previous)) return

      previous.classList.add('is-focus-silent')
      previous.focus({ preventScroll: true })

      const clear = () => {
        previous.classList.remove('is-focus-silent')
        previous.removeEventListener('blur', clear)
      }
      previous.addEventListener('blur', clear)
    }
  }, [])

  return ref
}
