/**
 * 应用入口：只算一次全局尺寸。
 *
 * 自绘导航栏与自定义 tabBar 都是 fixed 定位，页面得知道要给它们让出多少高度。
 * rpx 与 px 混在一起算不方便，所以在这里统一换算成 px 存进 globalData，
 * 页面拿到的就是一个能直接写进 style 的数字。
 */
App({
  onLaunch() {
    const info = wx.getSystemInfoSync()
    const rpx = info.windowWidth / 750
    const statusBarHeight = info.statusBarHeight || 20
    // 底部安全区（iPhone 的横条）：tabBar 底部要垫这么高
    const safeBottom = info.safeArea ? info.screenHeight - info.safeArea.bottom : 0

    this.globalData.statusBarHeight = statusBarHeight
    this.globalData.navHeight = statusBarHeight + 88 * rpx
    this.globalData.tabBarHeight = 112 * rpx + safeBottom
    this.globalData.safeBottom = safeBottom
    this.globalData.rpx = rpx
  },

  globalData: {
    statusBarHeight: 0,
    navHeight: 0,
    tabBarHeight: 0,
    safeBottom: 0,
    rpx: 0.5
  }
})
