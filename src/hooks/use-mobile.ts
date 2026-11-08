import * as React from 'react'

/**
 * 「多窄算手机」的阈值：低于它就按手机的紧凑排版处理。
 * （侧栏本身在 <1024px 就换成底部标签栏了，见 `use-compact`；这个 hook 现在主要用于
 * 名单浮层那类「只有手机上才成立」的分支。）
 *
 * CLI 给的默认是 768。主项目降到 **640**，因为改造前的断点本来就更靠下：
 * 旧外壳在 `≤1023` 把侧栏变成底部标签栏，1024 以上一直是 228px 的常驻侧栏；
 * 照搬 768 的话，把窗口拖窄一点的普通桌面场景（800–900px）也会突然变成抽屉，
 * 并且会盖一层 10% 黑遮罩（`Sheet` 的 overlay），观感就像「侧栏弹出来了」。
 *
 * 640 是手机竖屏的实际上限，再往下才是真该用抽屉的场合；
 * 640–768 之间留空间让侧栏自己折叠成图标条（`collapsible="icon"`），更接近原来的使用习惯。
 */
const MOBILE_BREAKPOINT = 640

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener('change', onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isMobile
}
