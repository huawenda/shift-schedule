import { describe, expect, it } from 'vitest'
import { canChooseBackupDir, getBackupDir, pickBackupDir, setBackupDir } from './backupDir'

/**
 * 单测跑在 node 环境（没有 localStorage），storage 会自动落到内存兜底 ——
 * 所以这里只验读写语义，不直接断言 localStorage 的键。
 * 「键名与持久化」由 verify-dist 在真实浏览器里覆盖。
 */
describe('备份默认存放目录', () => {
  it('默认没有设置', () => {
    setBackupDir(null)
    expect(getBackupDir()).toBeNull()
  })

  it('存进去能读回来，首尾空白会被去掉', () => {
    setBackupDir('  D:\\备份\\倒班表  ')
    expect(getBackupDir()).toBe('D:\\备份\\倒班表')
  })

  it('恢复默认 = 清掉，而不是写空串', () => {
    setBackupDir('C:\\temp')
    setBackupDir(null)
    expect(getBackupDir()).toBeNull()

    setBackupDir('   ')
    expect(getBackupDir()).toBeNull()
  })

  it('浏览器（无 __TAURI__）里不许选目录', () => {
    expect(canChooseBackupDir()).toBe(false)
  })

  it('没有原生对话框时选目录要报错，而不是静默返回 null', async () => {
    await expect(pickBackupDir(null)).rejects.toThrow('当前环境不支持选择目录')
  })
})
