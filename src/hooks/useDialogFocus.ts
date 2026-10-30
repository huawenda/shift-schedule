import { useEffect, useRef } from 'react'

/**
 * 弹层焦点管理：打开时把焦点移进弹层。
 *
 * 为什么必须做：模态弹层不管焦点的话，焦点会留在**打开它的那个按钮**上
 * （点日历格子开弹层，焦点就还在格子上）。用户随后按 ESC —— 这是键盘交互 ——
 * Chrome 会立刻给那个背景按钮补上 `:focus-visible` 焦点环（2px 强调色描边），
 * 弹层都关了，框线还留在格子上，看着像残留的墨绿框。
 *
 * 只移进去、**不还回去**：还焦点会重新触发同一套判断，框又回来了。
 * 弹层卸载时焦点自然回到 body，不留任何痕迹。
 */
export function useDialogFocus<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  return ref
}
