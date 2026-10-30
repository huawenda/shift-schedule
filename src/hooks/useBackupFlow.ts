import { useCallback } from 'react'
import { backupText, buildBackupFileName, parseBackup } from '../data/backup'
import { canChooseBackupDir, getBackupDir, writeBackupFile } from '../platform/backupDir'
import { downloadBackup } from '../platform/download'
import type { RosterApi } from './useRoster'
import type { ToastApi } from './useToasts'

/**
 * 导出 / 导入一条备份的业务流程。
 *
 * 产物落点分两类：壳里设过备份目录 → 直接写盘；其余情况（浏览器、静态版、
 * 壳里没设目录）→ 走下载。导入一律走 `parseBackup`，失败文案直接来自数据层。
 */
export function useBackupFlow(api: RosterApi, toast: ToastApi) {
  const backup = useCallback(async () => {
    const fileName = buildBackupFileName(new Date())
    const dir = getBackupDir()

    // 壳里且设过目录 → 直接写进去。用户挑的地方才是真·「默认存放位置」，
    // 这时再退回下载夹会让人以为文件跑到别处去了。
    if (dir && canChooseBackupDir()) {
      try {
        const saved = await writeBackupFile(dir, fileName, backupText(api.roster))
        toast.info(`已导出到 ${saved}`, { duration: 5000 })
        return
      } catch (error) {
        toast.error(`导出失败：${error instanceof Error ? error.message : String(error)}`, { closable: true })
        return
      }
    }

    try {
      const downloaded = downloadBackup(api.roster)
      toast.info(`已导出 ${downloaded}`)
    } catch {
      toast.error('导出失败', { closable: true })
    }
  }, [api.roster, toast])

  const restore = useCallback(async (file: File) => {
    const toastId = toast.sticky('正在导入…', { tone: 'info' })

    try {
      const result = parseBackup(await file.text())
      api.replaceRoster(result.roster)

      const base = `已导入 ${result.memberCount} 位成员、${result.overrideCount} 条记录`
      const dropped = result.droppedMembers.length > 0
        ? `另有 ${result.droppedMembers.length} 位成员的班序在备份里不存在，未能恢复：${result.droppedMembers.join('、')}`
        : undefined

      if (dropped) {
        // 有成员没恢复成功时需要用户读到，改成常驻、必须手动关闭
        toast.update(toastId, { text: '导入完成（部分成员未恢复）', detail: `${base}；${dropped}`, tone: 'warning', duration: null, closable: true })
      } else {
        toast.update(toastId, { text: '导入完成', detail: base, tone: 'info', duration: 5000 })
      }
    } catch (error) {
      toast.update(toastId, {
        text: error instanceof Error ? error.message : '导入失败',
        tone: 'error',
        duration: 5000,
        closable: true
      })
    }
  }, [api, toast])

  return { backup, restore }
}
