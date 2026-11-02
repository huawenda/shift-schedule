import { reactive } from 'vue'

/**
 * 外壳尺寸：导航栏高度、tabBar 高度、底部安全区。
 *
 * 原生版把这些算在 app.js 的 globalData 里；uni-app 的 App.vue 用组合式写法时
 * 没有 globalData 这个槽，所以改成一个响应式模块，组件与页面直接 import。
 *
 * 底部安全区不用 env()：安卓部分机型算出来是 0，tabBar 会盖不住手势条，
 * 宁可高一点也不要底部露白（见 DESIGN.md §2.2）。
 */
export const frame = reactive({
  statusBarHeight: 20,
  navHeight: 64,
  tabBarHeight: 70,
  safeBottom: 14,
  rpx: 0.5
})

export function measureFrame() {
  const info = uni.getWindowInfo()
  const rpx = (info.windowWidth || 375) / 750
  const statusBarHeight = info.statusBarHeight || 20
  const measured = info.safeArea ? (info.screenHeight || 0) - info.safeArea.bottom : 0
  const safeBottom = measured > 0 ? measured : 14

  frame.statusBarHeight = statusBarHeight
  frame.rpx = rpx
  frame.safeBottom = safeBottom
  frame.navHeight = statusBarHeight + 88 * rpx
  frame.tabBarHeight = 112 * rpx + safeBottom
}
