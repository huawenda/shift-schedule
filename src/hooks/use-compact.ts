import * as React from 'react'

/**
 * 「多宽算紧凑」的阈值：低于它就把侧栏换成底部标签栏。
 *
 * 1024 是旧外壳的同一道线 —— 改造前在 ≤1023 时侧栏会变成底部标签栏
 * （见 DESIGN.md §6 的窄屏行为表），这里沿用同一口径，不另起一套。
 *
 * 与 `use-mobile`（640）的区别：
 * - 640 是手机竖屏的实际上限，用来判断「要不要按手机的紧凑排版重排」；
 * - 1024 是「侧栏还站不站得住」的界线，桌面窄窗（800–900px）也用底部标签栏。
 */
const COMPACT_BREAKPOINT = 1024

export function useIsCompact() {
  const [isCompact, setIsCompact] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${COMPACT_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsCompact(window.innerWidth < COMPACT_BREAKPOINT)
    }
    mql.addEventListener('change', onChange)
    setIsCompact(window.innerWidth < COMPACT_BREAKPOINT)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isCompact
}
