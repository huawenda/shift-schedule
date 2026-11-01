/**
 * 自绘导航栏：状态栏 + 88rpx。
 *
 * 为什么不用系统导航栏：白底黑字会把「深框」切断，上下两截颜色对不上，
 * 整个应用看起来像套了个模板。这里一并把品牌字与上下文动作放进来。
 *
 * 用法：
 * - tab 页     <nav-bar action="概览 ›" bind:action="onOverview" />
 * - 二级页     <nav-bar back title="人员配置" />
 */
Component({
  properties: {
    /** 显示返回箭头（二级页） */
    back: { type: Boolean, value: false },
    /** 中文页名；为空时显示品牌字「昼夜」 */
    title: { type: String, value: '' },
    /** 右侧动作文案；为空则不渲染 */
    action: { type: String, value: '' }
  },

  data: {
    statusBarHeight: 20
  },

  lifetimes: {
    attached() {
      const app = getApp()
      this.setData({
        statusBarHeight: (app && app.globalData && app.globalData.statusBarHeight) || 20
      })
    }
  },

  methods: {
    onBack() {
      wx.navigateBack({ delta: 1 })
    },

    onAction() {
      this.triggerEvent('action')
    }
  }
})
