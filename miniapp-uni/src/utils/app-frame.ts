import { reactive } from 'vue'

/**
 * 外壳尺寸：状态栏、导航栏、tabBar、底部安全区、右上角胶囊占位。
 *
 * 与桌面手机档对齐：
 * - 顶栏内容高 48px（桌面 `--topbar-height`），下面才是状态栏；
 * - 底栏 4 + 48 + 4 = 56px，再加安全区（桌面 `.rail` 的 padding + 48 项）；
 * - 右上角微信胶囊不可隐藏，月份控件要给胶囊留出真实宽度。
 */
export const frame = reactive({
  statusBarHeight: 0,
  navHeight: 48,
  tabBarHeight: 56,
  safeBottom: 0,
  capsuleInset: 0,
  /** 旧页面还在用它换算日期列宽，迁移完成后可删 */
  rpx: 0.5
})

export function measureFrame() {
  const info = uni.getWindowInfo()
  const statusBarHeight = info.statusBarHeight || 0
  const measured = info.safeArea ? (info.screenHeight || 0) - info.safeArea.bottom : 0
  const safeBottom = measured > 0 ? measured : 0

  let capsuleInset = 0
  const api = uni as unknown as {
    getMenuButtonBoundingClientRect?: () => { left: number; width: number } | null
  }
  try {
    const menu = api.getMenuButtonBoundingClientRect?.()
    if (menu && menu.left > 0) {
      capsuleInset = Math.max(0, (info.windowWidth || 390) - menu.left + 8)
    }
  } catch {
    // H5 / 非微信端没有胶囊
  }

  frame.statusBarHeight = statusBarHeight
  frame.safeBottom = safeBottom
  frame.capsuleInset = capsuleInset
  frame.navHeight = statusBarHeight + 48
  // 1px 上边框 + 4px 上内边距 + 48px 项 + 4px 下内边距 + 安全区
  frame.tabBarHeight = 57 + safeBottom
  frame.rpx = (info.windowWidth || 390) / 750
}
