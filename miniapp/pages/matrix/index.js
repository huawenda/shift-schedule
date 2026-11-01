const demo = require('../../utils/demo.js')

/**
 * 全员矩阵：行 = 人、列 = 天，横向滚动。
 *
 * 手机上一屏只放得下 11 天左右，所以姓名列固定、日期列横滑 ——
 * 这样「某人整月连着上什么班」仍能连成一条带，转置成「一天一行人」就看不出来了。
 */
Page({
  data: {
    navHeight: 44,
    tabBarHeight: 56,
    month: demo.period,
    summary: demo.todaySummary,
    days: demo.matrix.days,
    rows: demo.matrix.rows,
    /** 点「今天」时滚到的位置（px）；由 onToday 计算 */
    scrollLeft: 0,
    // 图例只用单字：手机一行放得下六项，写全称会折行
    legends: [
      { short: '白', label: '白班', tone: 'day' },
      { short: '夜', label: '夜班', tone: 'night' },
      { short: '休', label: '休息', tone: 'rest' },
      { short: '特', label: '白特', tone: 'dayx' },
      { short: '特', label: '夜特', tone: 'nightx' },
      { short: '假', label: '事假', tone: 'leave' }
    ]
  },

  onLoad() {
    const app = getApp()
    this.setData({
      navHeight: app.globalData.navHeight,
      tabBarHeight: app.globalData.tabBarHeight
    })
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 1 })
  },

  onToday() {
    const app = getApp()
    const index = this.data.days.findIndex(item => item.isToday)
    if (index < 0) return
    // 今天靠左、前面留两列做上下文；56rpx 是日期列宽
    const rpx = app.globalData.rpx
    this.setData({ scrollLeft: Math.max(0, (index - 2) * 56 * rpx) })
  }
})
