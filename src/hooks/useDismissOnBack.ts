import { useEffect, useRef } from 'react'

/** 每层弹层一个唯一 id，用来分辨 popstate 是「关掉自己」还是「关掉更内层」 */
let sequence = 0

/**
 * 系统返回键：先关当前弹层 / 抽屉，再退出应用。
 *
 * 弹层打开时压一条哨兵历史（URL 不变，只在 history.state 里记一个 id）。
 * 返回键触发 popstate：
 * - `event.state.sheetId` 仍是自己的 id → 说明只是更内层被关掉，自己继续开着；
 * - 否则 → 自己的哨兵被消费，调用 onClose。
 *
 * 通过 UI（遮罩 / 关闭按钮）关闭时，历史里还留着这条哨兵；
 * cleanup 里等一拍确认它仍是自己的，再 `history.back()` 退掉，避免历史越积越多。
 *
 * ⚠️ React StrictMode 的 effect 会连着跑「setup → cleanup → setup」。
 * 所以 id 存在 ref 里（同一个组件实例只用一个哨兵），第二次 setup 会把上一次
 * cleanup 排定的回退取消并复用同一条历史 —— 否则刚打开的弹层会被异步 back 立刻关掉
 * （表现为「弹层弹不出来」），并且每次开合都多留一条死历史。
 *
 * 应用内导航本身全部走 replaceState（见 App 的 navigate），
 * 所以除弹层外不会再有别的东西压历史 —— 弹层关完，下一次返回就是退出应用。
 */
export function useDismissOnBack(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const idRef = useRef<string | null>(null)
  const pendingBack = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return

    if (!idRef.current) idRef.current = `sheet-${++sequence}`
    const id = idRef.current

    // StrictMode 的第二次 setup：取消上一次 cleanup 排好的回退，复用同一条哨兵
    if (pendingBack.current !== null) {
      window.clearTimeout(pendingBack.current)
      pendingBack.current = null
    }
    if (window.history.state?.sheetId !== id) {
      window.history.pushState({ ...(window.history.state ?? {}), sheetId: id }, '', window.location.href)
    }

    function onPop(event: PopStateEvent) {
      if (event.state?.sheetId === id) return
      closeRef.current()
    }

    window.addEventListener('popstate', onPop)

    return () => {
      window.removeEventListener('popstate', onPop)
      // 等一拍：若期间又被 setup（StrictMode / 快速开合），state 已换成新哨兵，就不回退
      pendingBack.current = window.setTimeout(() => {
        pendingBack.current = null
        if (window.history.state?.sheetId === id) window.history.back()
      }, 0)
    }
  }, [open])
}
