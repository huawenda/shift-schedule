/**
 * JIG 页的导出能力：选保存位置 + 写二进制文件。
 *
 * 与 `jigFile.ts`（选文件 / 读文件 / 读剪贴板）是同一套思路：
 * 走 `window.__TAURI__` 全局对象，不装 `@tauri-apps/*` 前端包。
 *
 * 静态版 / 浏览器里没有这些能力，相关调用一律抛错或返回 null，
 * 由界面决定是禁用按钮还是给一句说明。
 */

import { isTauriShell } from '@/platform/env'

import { writeRaw, STORAGE_KEYS } from './storage'
import { tauri } from './tauri'

/** 导出的目标：一份表 + 可选的红色标记 */
export interface JigExportPayload {
  /** 表的列序与行 */
  table: { columns: string[]; rows: Record<string, string>[] }
  /**
   * 需要标红的单元格。
   *
   * `rows` 与 table.rows 同序（true 表示这一行要标红），
   * `column` 是要标红的列名。
   */
  red?: { rows: boolean[]; column: string }
}

/** 只有壳里能导出 */
export function canExportJig(): boolean {
  return isTauriShell() && Boolean(tauri()?.dialog?.save)
}

/**
 * 文件名清理。
 *
 * P/N 与工序名里可能出现 Windows 的非法字符（`\ / : * ? " < > |`），
 * 直接当文件名会写不出来。
 */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '')
}

/**
 * 给文件名加时间戳（导出文件名加时间戳的偏好）。
 *
 * 格式 `20261109-1530` —— 排序友好，且不含 Windows 非法字符。
 */
export function withTimestamp(fileName: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return `${fileName}_${stamp}`
  return `${fileName.slice(0, dot)}_${stamp}${fileName.slice(dot)}`
}

/**
 * 弹出「另存为」对话框，用户选定后把内容写进去。
 *
 * 返回落盘后的完整路径；用户取消返回 null。
 *
 * `defaultPath` 传上次用过的目录，第二次导出时直接落在那里。
 */
export async function exportJigFile(
  fileName: string,
  bytes: Uint8Array,
  defaultDir: string | null
): Promise<string | null> {
  const dialog = tauri()?.dialog
  const invoke = tauri()?.core?.invoke
  if (!dialog?.save) throw new Error('当前环境不支持导出')
  if (!invoke) throw new Error('当前环境不支持导出')

  const path = await dialog.save({
    title: '导出 Excel',
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    ...(defaultDir ? { defaultPath: defaultDir } : {})
  })
  if (!path) return null

  await invoke('save_jig_export', { path, contents: Array.from(bytes) })

  // 记住这次的目录 —— 下次导出直接落在那里
  const sep = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  if (sep > 0) {
    writeRaw(STORAGE_KEYS.jigExportDir, path.slice(0, sep))
  }

  return path
}
