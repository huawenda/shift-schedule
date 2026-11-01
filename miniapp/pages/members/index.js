const demo = require('../../utils/demo.js')

/**
 * 人员配置：成员与班序。
 *
 * 它不是「高级设置」而是入口 —— 没有成员与班序，日历与矩阵都是空的。
 * 当前阶段的增删改只改内存（不落盘），接数据层时把 setData 换成 store 命令。
 */
Page({
  data: {
    navHeight: 44,
    tab: 'member',
    members: [],
    patterns: [],
    editor: null,
    canSave: false,
    canDelete: false
  },

  onLoad() {
    this.setData({
      navHeight: getApp().globalData.navHeight,
      members: demo.members.map(member => Object.assign({}, member, { isSelf: member.id === 'm-01' })),
      patterns: demo.patterns
    })
  },

  onTab(event) {
    this.setData({ tab: event.currentTarget.dataset.tab })
  },

  onPattern(event) {
    wx.navigateTo({ url: '/pages/pattern/index?id=' + event.currentTarget.dataset.id })
  },

  /* ---------------------------------------------------------- 抽屉 */

  onMember(event) {
    const id = event.currentTarget.dataset.id
    const member = this.data.members.filter(item => item.id === id)[0]
    if (!member) return
    this.setData({
      editor: {
        mode: 'edit',
        id,
        name: member.name,
        position: member.position || '',
        patternId: member.pattern,
        isSelf: member.isSelf
      }
    })
    this.refreshFlags()
  },

  onAdd() {
    this.setData({
      editor: { mode: 'add', id: 'm-' + (this.data.members.length + 1), name: '', position: '', patternId: '4F', isSelf: false }
    })
    this.refreshFlags()
  },

  onNameInput(event) {
    this.setData({ 'editor.name': event.detail.value })
    this.refreshFlags()
  },

  onPositionInput(event) {
    this.setData({ 'editor.position': event.detail.value })
  },

  onPickPattern(event) {
    this.setData({ 'editor.patternId': event.currentTarget.dataset.id })
  },

  onToggleSelf() {
    this.setData({ 'editor.isSelf': !this.data.editor.isSelf })
  },

  onSave() {
    const editor = this.data.editor
    if (!editor || !this.data.canSave) return

    const name = editor.name.trim()
    const position = editor.position.trim()
    let members = this.data.members

    if (editor.mode === 'add') {
      members = members.concat([{
        id: editor.id,
        name,
        position,
        pattern: editor.patternId,
        isSelf: editor.isSelf
      }])
    } else {
      members = members.map(member => member.id === editor.id
        ? Object.assign({}, member, { name, position, pattern: editor.patternId, isSelf: editor.isSelf })
        : member)
    }

    // 本人只能有一个：设了新的，其余全部取消
    if (editor.isSelf) {
      members = members.map(member => Object.assign({}, member, { isSelf: member.id === editor.id }))
    }

    this.setData({ members, editor: null })
  },

  onDelete() {
    if (!this.data.canDelete) return
    const id = this.data.editor.id
    this.setData({
      members: this.data.members.filter(member => member.id !== id),
      editor: null
    })
  },

  onClose() {
    this.setData({ editor: null })
  },

  /** 抽屉内部的空点击：挡住遮罩的关闭动作 */
  onStop() {},

  refreshFlags() {
    const editor = this.data.editor
    if (!editor) return
    this.setData({
      canSave: editor.name.trim().length > 0,
      canDelete: editor.mode === 'edit' && this.data.members.length > 1
    })
  }
})
