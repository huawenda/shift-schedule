import { useCallback } from 'react'
import { backupText, buildBackupFileName, parseBackup } from '../data/backup'
import { canChooseBackupDir, getBackupDir, writeBackupFile } from '../platform/backupDir'
import { downloadBackup } from '../platform/download'
import type { RosterApi } from './useRoster'

interface BackupFlowOptions {
  setStatusText: (text: string) => void
  setNotice: (text: string) => void
}

/**
 * 导出 / 导入一条备份的业务流程。
 *
 * 产物落点分两类：壳里设过备份目录 → 直接写盘；其余情况（浏览器、静态版、
 * 壳里没设目录）→ 走下载。导入一律走 `parseBackup`，失败文案直接来自数据层。
 */
export function useBackupFlow(api: RosterApi, { setStatusText, setNotice }: BackupFlowOptions) {
  const backup = useCallback(async () => {
    const fileName = buildBackupFileName(new Date())
    const dir = getBackupDir()

    // 壳里且设过目录 → 直接写进去。用户挑的地方才是真·「默认存放位置」，
    // 这时再退回下载夹会让人以为文件跑到别处去了。
    if (dir && canChooseBackupDir()) {
      try {
        const saved = await writeBackupFile(dir, fileName, backupText(api.roster))
        setStatusText(`已导出到 ${saved}`)
        return
      } catch (error) {
        setStatusText(`导出失败：${error instanceof Error ? error.message : String(error)}`)
        return
      }
    }

    try {
      const downloaded = downloadBackup(api.roster)
      setStatusText(`已导出 ${downloaded}`)
    } catch {
      setStatusText('导出失败')
    }
  }, [api.roster, setStatusText])

  const restore = useCallback(async (file: File) => {
    setStatusText('正在导入…')
    try {
      const result = parseBackup(await file.text())
      api.replaceRoster(result.roster)
      setStatusText('导入完成')

      const base = `已导入 ${result.memberCount} 位成员、${result.overrideCount} 条记录`
      setNotice(
        result.droppedMembers.length > 0
          ? `${base}；另有 ${result.droppedMembers.length} 位成员的班序在备份里不存在，未能恢复：${result.droppedMembers.join('、')}`
          : base
      )
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '导入失败')
    }
  }, [api, setNotice, setStatusText])

  return { backup, restore }
}
