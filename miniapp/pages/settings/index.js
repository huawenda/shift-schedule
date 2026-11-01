const demo = require('../../utils/demo.js')

/**
 * 设置：整页就是纸，靠分组标题与发丝线分区，不叠卡片。
 * 人员配置是入口而不是「高级设置」—— 没有成员与班序时日历与矩阵都是空的。
 */
Page({
  data: {
    navHeight: 44,
    tabBarHeight: 56,
    profile: demo.profile,
    memberCount: demo.members.length,
    patternCount: demo.patterns.length
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
    if (tabBar) tabBar.setData({ selected: 2 })
  },

  onMembers() {
    wx.navigateTo({ url: '/pages/members/index' })
  },

  onSoon() {
    wx.showToast({ title: '演示阶段暂未接通', icon: 'none' })
  }
})
