import { isTauriShell } from './env'
import { tauri } from './tauri'
import { readRaw, removeRaw, writeRaw, STORAGE_KEYS } from './storage'

/**
 * 备份的「默认存放目录」。
 *
 * 只有桌面壳能真正做到这件事：
 * - 壳里走 Tauri 的原生目录选择器（dialog 插件），拿到绝对路径后由 Rust 侧写文件；
 * - 浏览器里 `<a download>` 一律落进系统「下载」文件夹，Chrome 不允许网页记住
 *   一个目录（File System Access API 能挑目录，但要每次重新授权，且不是所有浏览器都有）。
 *
 * 所以这层只负责「记住一个路径字符串」，是否可用由调用方按 `canChooseBackupDir()` 判断。
 */

/** 只有壳里能「选目录 + 写任意目录」，浏览器里这一行要禁用 */
export function canChooseBackupDir(): boolean {
  return isTauriShell() && Boolean(tauri()?.dialog?.open)
}

export function getBackupDir(): string | null {
  const raw = readRaw(STORAGE_KEYS.backupDir)
  const trimmed = raw?.trim()
  return trimmed ? trimmed : null
}

/**
 * 系统「下载」文件夹的**真实路径**（没设默认目录时导出会落在这里）。
 *
 * 只有壳里拿得到：Tauri 的 path API 读的是这台机器的实际配置
 * （用户可能已经把下载夹挪到了 D 盘）。浏览器里 `<a download>` 的落点
 * 由浏览器决定，网页无权读取，所以返回 null，界面退回说明文字。
 */
export async function resolveDefaultDownloadDir(): Promise<string | null> {
  if (!isTauriShell()) return null

  const downloadDir = tauri()?.path?.downloadDir
  if (!downloadDir) return null

  try {
    const dir = await downloadDir()
    // 去掉结尾的分隔符，免得界面上出现「D:\下载\」这种多余的反斜杠
    const trimmed = dir.trim().replace(/[\\/]+$/, '')
    return trimmed || null
  } catch {
    return null
  }
}

export function setBackupDir(dir: string | null): void {
  const trimmed = dir?.trim()
  if (trimmed) writeRaw(STORAGE_KEYS.backupDir, trimmed)
  else removeRaw(STORAGE_KEYS.backupDir)
}

/**
 * 弹出系统目录选择器。用户取消返回 null。
 *
 * `defaultPath` 传当前目录，第二次挑的时候就直接落在上次的位置，
 * 省得每次都从「此电脑」重新点进去。
 */
export async function pickBackupDir(current: string | null): Promise<string | null> {
  const dialog = tauri()?.dialog
  if (!dialog?.open) throw new Error('当前环境不支持选择目录')

  const picked = await dialog.open({
    directory: true,
    multiple: false,
    title: '选择备份存放目录',
    ...(current ? { defaultPath: current } : {})
  })

  if (!picked) return null
  const path = Array.isArray(picked) ? picked[0] : picked
  return path ? path : null
}

/**
 * 把备份写进指定目录，返回完整路径。
 *
 * 走壳里自定义的 `save_backup_to` 命令，而不是 fs 插件：fs 的权限被刻意限制在
 * `$DOWNLOAD` / `$DOCUMENT` 两个目录（见 capabilities/default.json），
 * 而这里用户可能挑 `D:\备份` 这种任意位置。Rust 侧只写这一个文件，不读、不遍历。
 */
export async function writeBackupFile(dir: string, fileName: string, contents: string): Promise<string> {
  const invoke = tauri()?.core?.invoke
  if (!invoke) throw new Error('当前环境不支持写文件')
  return invoke<string>('save_backup_to', { dir, fileName, contents })
}
