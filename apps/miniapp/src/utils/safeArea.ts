import Taro from '@tarojs/taro'

/**
 * 小程序自定义导航栏（navigationStyle: custom）的安全区计算。
 *
 * 背景：小程序右上角有一个系统胶囊按钮（••• 与 ⊙），它浮在页面之上。
 * Web 端没有这个东西，所以 Web 的布局不需要为它让位。
 *
 * 解法是**两行式顶栏**而不是计算让位宽度：
 * 第一行只放标题，视觉中心与胶囊对齐（靠 paddingTop 顶开状态栏），右侧留空；
 * 第二行是胶囊下方的整行空间，所有控件都放在这里。
 * 这样控件永远落在胶囊下方，不必为胶囊算 paddingRight、
 * 也不必反复核算横向预算、砍掉信息或收窄按钮。
 */

interface MenuButtonRect {
  top?: number
  left?: number
  right?: number
  bottom?: number
  width?: number
  height?: number
}

/** 拿不到胶囊信息时的兜底上边距（px），约等于状态栏高度。 */
const fallbackTopPadding = 48

export function getWindowWidth(): number {
  const miniProgramGlobal = globalThis as typeof globalThis & {
    wx?: {
      getWindowInfo?: () => { windowWidth?: number }
    }
  }
  const nativeWindowWidth = miniProgramGlobal.wx?.getWindowInfo?.().windowWidth
  if (typeof nativeWindowWidth === 'number' && nativeWindowWidth > 0) return nativeWindowWidth

  const taroWithWindowInfo = Taro as typeof Taro & {
    getWindowInfo?: () => { windowWidth?: number }
  }
  const windowWidth = taroWithWindowInfo.getWindowInfo?.().windowWidth
  if (typeof windowWidth === 'number' && windowWidth > 0) return windowWidth

  return 375
}

export function getMenuButtonRect(): MenuButtonRect | null {
  try {
    const rect = Taro.getMenuButtonBoundingClientRect?.() as MenuButtonRect | undefined
    if (rect && typeof rect.left === 'number' && typeof rect.height === 'number' && rect.height > 0) {
      return rect
    }
  } catch {
    // 部分开发工具运行时在首帧拿不到胶囊信息。
  }

  return null
}

/**
 * 顶栏上方需要让给状态栏 + 胶囊的高度（px）。
 * 做法是把标题行的视觉中心对齐到胶囊的视觉中心，
 * 这样「倒班表 / 统计」这类标题看起来就与胶囊水平齐平。
 *
 * 配合两行式顶栏使用：第一行只放标题并与胶囊齐平，
 * 第二行（.masthead-tools / .stats-head-tools）整行都在胶囊下方。
 * 因此**不需要**再为胶囊计算右侧让位宽度，也就不必反复核算横向预算。
 */
export function getHeaderTopPadding(titleLineHeightRpx: number): string {
  const rect = getMenuButtonRect()
  const windowWidth = getWindowWidth()

  if (
    !rect
    || typeof rect.top !== 'number'
    || typeof rect.height !== 'number'
    || rect.top <= 0
    || windowWidth <= 0
  ) {
    return `${fallbackTopPadding}px`
  }

  const rpxScale = windowWidth / 750
  const titleLineHeight = titleLineHeightRpx * rpxScale
  const alignedTop = rect.top + ((rect.height - titleLineHeight) / 2)

  return `${Math.max(alignedTop, 0)}px`
}

/**
 * 内容区顶部内边距：直接顶到系统胶囊底部再留一段呼吸位。
 *
 * 适用于「没有独立标题行」的页面（新版今日页/月历页）：
 * 内容整体从胶囊下方开始，不必再为标题行做视觉对齐。
 */
export function getSafeTop(gap = 8): string {
  const rect = getMenuButtonRect()
  if (
    !rect
    || typeof rect.top !== 'number'
    || typeof rect.height !== 'number'
    || rect.top <= 0
  ) {
    return `${fallbackTopPadding}px`
  }
  return `${rect.top + rect.height + gap}px`
}

/**
 * 顶栏第一行还需要补的下边距（px）。
 *
 * 只靠 paddingTop 把标题推到胶囊中心是不够的：
 * 第一行的实际高度 = paddingTop + 标题行高 ≈ 52 + 24 = 76px，
 * 而胶囊底部在 top + height ≈ 80px —— 胶囊会溢出到第二行，
 * 于是「胶囊下方的内容」和胶囊糊成一片（用户截图反馈）。
 *
 * 这里按「胶囊底部 + 8px 呼吸位」反算第一行还要补多少下边距，
 * 补完之后胶囊与第二行控件之间才有明确留白。
 */
export function getHeaderBottomPadding(titleLineHeightRpx: number): string {
  const rect = getMenuButtonRect()
  const windowWidth = getWindowWidth()

  if (
    !rect
    || typeof rect.top !== 'number'
    || typeof rect.height !== 'number'
    || rect.top <= 0
    || windowWidth <= 0
  ) {
    return '10px'
  }

  const rpxScale = windowWidth / 750
  const titleLineHeight = titleLineHeightRpx * rpxScale
  const alignedTop = rect.top + ((rect.height - titleLineHeight) / 2)
  const contentBottom = alignedTop + titleLineHeight
  const capsuleBottom = rect.top + rect.height

  return `${Math.max(capsuleBottom + 8 - contentBottom, 0)}px`
}
