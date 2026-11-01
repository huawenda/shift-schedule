const demo = require('../../utils/demo.js')

/** 班序格子里只能填这三种：白特 / 夜特 / 事假 是单天的临时决定，不进 24 天循环 */
const CYCLE = ['白班', '夜班', '休息']
const META = demo.labels.shift

/**
 * 班序编辑：24 天循环，6 列 × 4 行。
 *
 * 单独开全屏页而不放抽屉：抽屉里只露两行，点着会滑。
 * 内置 13 条只读 —— 点格子只提示，不出现保存。
 */
Page({
  data: {
    navHeight: 44,
    title: '',
    builtin: true,
    users: 0,
    cells: []
  },

  onLoad(query) {
    const id = (query && query.id) || '4F'
    const pattern = demo.patterns.filter(item => item.id === id)[0] || demo.patterns[0]

    this.setData({
      navHeight: getApp().globalData.navHeight,
      title: pattern.name,
      builtin: pattern.builtin,
      users: pattern.users,
      cells: pattern.shifts.map((shift, index) => cellOf(shift, index))
    })
  },

  onTap(event) {
    if (this.data.builtin) {
      wx.showToast({ title: '内置班序不可修改', icon: 'none' })
      return
    }

    const index = Number(event.currentTarget.dataset.index)
    const cells = this.data.cells.slice()
    const next = CYCLE[(CYCLE.indexOf(cells[index].shift) + 1) % CYCLE.length]
    cells[index] = cellOf(next, index)
    this.setData({ cells })
  }
})

function cellOf(shift, index) {
  return {
    day: String(index + 1).padStart(2, '0'),
    shift,
    short: META[shift].short,
    tone: META[shift].tone
  }
}
