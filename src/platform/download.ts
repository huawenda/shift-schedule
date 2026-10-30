import { backupText, buildBackupFileName } from '../data/backup'
import type { Roster } from '../data/roster'

/**
 * 浏览器 / 静态版：把备份作为文件下载。
 * 桌面壳里设过备份目录时走 `backupDir.ts` 的写盘路径，不经过这里。
 */
export function downloadBackup(roster: Roster): string {
  const fileName = buildBackupFileName(new Date())
  const blob = new Blob([backupText(roster)], { type: 'application/json' })
  const objectUrl = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  return fileName
}
