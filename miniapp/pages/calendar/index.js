const demo = require('../../utils/demo.js')

/**
 * 个人日历：一屏回答「我今天什么班、这个月怎么排」。
 *
 * 当前阶段只接 demo 数据（见 miniapp/DESIGN.md §0）。
 * 接数据层时把 demo 换成 store，WXML / WXSS 一行不改。
 */
Page({
  data: {
    navHeight: 44,
    tabBarHeight: 56,
    month: demo.period,
    today: demo.today,
    profile: demo.profile,
    cells: demo.cells,
    weekdays: ['日', '一', '二', '三', '四', '五', '六']
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
    if (tabBar) tabBar.setData({ selected: 0 })
  },

  onOverview() {
    wx.navigateTo({ url: '/pages/overview/index' })
  },

  onStep() {
    wx.showToast({ title: '演示数据只有本期', icon: 'none' })
  }
})
