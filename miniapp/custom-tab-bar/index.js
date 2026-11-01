/**
 * 自定义 tabBar：深青底 + 胶囊选中。
 *
 * 不用图标：深青底上的 16px 线性图标会糊成灰点；胶囊选中态与深色外壳更合。
 * 选中态由各页 onShow 调 getTabBar().setData({ selected }) 同步 —— 组件自己
 * 拿不到当前路由，也不该去猜。
 */
Component({
  data: {
    selected: 0,
    list: [
      { index: 0, text: '日历', path: '/pages/calendar/index' },
      { index: 1, text: '矩阵', path: '/pages/matrix/index' },
      { index: 2, text: '设置', path: '/pages/settings/index' }
    ]
  },

  methods: {
    onTap(event) {
      const target = Number(event.currentTarget.dataset.index)
      if (target === this.data.selected) return
      wx.switchTab({ url: this.data.list[target].path })
    }
  }
})
