import { describe, expect, it, vi } from 'vitest'
import {
  canChooseBackupDir,
  getBackupDir,
  pickBackupDir,
  resolveDefaultDownloadDir,
  setBackupDir
} from './backupDir'

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
    setBackupDir('  D:\\备份\\Workhorse  ')
    expect(getBackupDir()).toBe('D:\\备份\\Workhorse')
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

  it('浏览器里拿不到系统下载夹的真实路径', async () => {
    await expect(resolveDefaultDownloadDir()).resolves.toBeNull()
  })

  it('壳里解析真实路径，并去掉结尾的分隔符', async () => {
    vi.stubGlobal('window', {
      __TAURI_INTERNALS__: {},
      __TAURI__: { path: { downloadDir: async () => 'D:\\下载\\' } }
    })

    try {
      await expect(resolveDefaultDownloadDir()).resolves.toBe('D:\\下载')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('路径解析失败时返回 null，不让设置页崩掉', async () => {
    vi.stubGlobal('window', {
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        path: {
          downloadDir: async () => {
            throw new Error('解析失败')
          }
        }
      }
    })

    try {
      await expect(resolveDefaultDownloadDir()).resolves.toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
