/**
 * 全局状态：只有一份 roster。
 *
 * 不做响应式框架 —— 页面在 onLoad 里 subscribe，改完数据主动 notify，
 * 页面自己 setData。这样每次数据变动的影响范围是显式的，也方便排查
 * 「谁把矩阵刷了」这类问题。
 */
const storage = require('./storage.js')

const EMPTY_ROSTER = {
  members: [],
  overrides: [],
  patterns: [],
  todos: [],
  profile: null,
  updatedAt: 0
}

let roster = EMPTY_ROSTER
const listeners = new Set()

function init() {
  const stored = storage.readRoster()
  roster = stored ?? EMPTY_ROSTER
  notify()
}

function getRoster() {
  return roster
}

/** 换掉整份 roster：桌面端的命令层也是「不可变替换」，这里保持一致 */
function setRoster(next) {
  roster = { ...next, updatedAt: Date.now() }
  storage.writeRoster(roster)
  notify()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify() {
  listeners.forEach(listener => listener(roster))
}

module.exports = { EMPTY_ROSTER, init, getRoster, setRoster, subscribe }
