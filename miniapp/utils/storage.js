/**
 * 本机存储：小程序版。
 *
 * 键名与桌面端 platform/storage.ts 保持一致 —— 但两边数据不会自动互通，
 * 跨设备迁移走备份 JSON（src/data/backup.ts），不是靠同名键。
 *
 * 桌面端那套「localStorage 不可用就退化成内存 + 提示导出备份」的策略在这里同样成立：
 * 存储写失败时页面仍能跑，只是重启会丢数据，调用方据此提示。
 */
const KEYS = {
  roster: 'shift-schedule:local:roster:v2'
}

const memoryFallback = new Map()

function readRaw(key) {
  try {
    const value = wx.getStorageSync(key)
    if (value === '' || value === undefined || value === null) {
      return memoryFallback.get(key) ?? null
    }
    return value
  } catch (error) {
    return memoryFallback.get(key) ?? null
  }
}

function writeRaw(key, value) {
  memoryFallback.set(key, value)
  try {
    wx.setStorageSync(key, value)
    return true
  } catch (error) {
    return false
  }
}

function readRoster() {
  const stored = readRaw(KEYS.roster)
  if (!stored || typeof stored !== 'object') return null
  // 旧数据/手改数据一律过一遍收敛，和桌面端同一条规则
  const { normalizeRosterDetailed } = require('../lib/data/roster/index.js')
  return normalizeRosterDetailed(stored).roster
}

function writeRoster(roster) {
  return writeRaw(KEYS.roster, roster)
}

module.exports = { KEYS, readRoster, writeRoster }
