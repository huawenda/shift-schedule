const demo = require('../../utils/demo.js')

function money(value) {
  return '¥' + value.toFixed(2)
}

/** 本月概览：班次贴片 / 加班分布 / 薪资结账 */
Page({
  data: {
    navHeight: 44,
    period: demo.period,
    counts: demo.overview.counts,
    ots: [],
    earnRows: [],
    deductRows: [],
    grossText: '',
    netText: '',
    overtimeTotal: ''
  },

  onLoad() {
    const salary = demo.overview.salary
    const hours = demo.overview.overtime.reduce((sum, item) => sum + item.hours, 0)

    this.setData({
      navHeight: getApp().globalData.navHeight,
      ots: demo.overview.overtime.map(item => ({
        label: item.label,
        kind: item.kind,
        hoursText: item.hours + 'h',
        payText: money(item.pay),
        percent: Math.round(item.ratio * 100)
      })),
      earnRows: [
        { label: '固定应发', value: money(salary.fixedTotal) },
        { label: '平日加班', value: money(salary.weekdayPay) },
        { label: '特勤加班', value: money(salary.specialPay) },
        { label: '法定加班', value: money(salary.legalPay) },
        { label: '夜班津贴', value: money(salary.nightAllowance) }
      ],
      deductRows: [
        { label: '社保公积金', value: '−' + money(salary.socialFund) },
        { label: '事假扣款', value: '−' + money(salary.leaveDeduction) }
      ],
      grossText: money(salary.gross),
      netText: money(salary.net),
      overtimeTotal: hours + 'h'
    })
  }
})
