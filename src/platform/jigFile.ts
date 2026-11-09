/**
 * JIG 页的平台能力：选文件、读文件、读剪贴板。
 *
 * 走 `window.__TAURI__` 全局对象，与本项目其它平台层（backupDir / theme /
 * windowPrefs）同一套写法 —— 不装 `@tauri-apps/*` 前端包：
 * 壳开了 `withGlobalTauri`，多一个依赖就多一份版本对齐的负担。
 *
 * 静态版 / 浏览器里没有这些能力，相关调用一律抛错或返回 null，
 * 由界面决定是禁用按钮还是给一句说明。
 */

import { isTauriShell } from '@/platform/env'

import { tauri } from './tauri'

/** 用户选中的一个源文件 */
export interface PickedJigFile {
  /** 绝对路径（壳里才有；浏览器回退拿不到） */
  path: string
  /** 文件名，用于界面显示 */
  name: string
}

/** 只有壳里能选文件 */
export function canPickJigFile(): boolean {
  return isTauriShell() && Boolean(tauri()?.dialog?.open)
}

/**
 * 弹出原生文件选择器挑一个 Excel。用户取消返回 null。
 *
 * `defaultPath` 传上次用过的目录，第二次挑的时候直接落在那里 ——
 * MES 导出的文件通常在固定的共享目录里，每次从「此电脑」点进去很费事。
 */
export async function pickJigExcelFile(
  defaultDir: string | null
): Promise<PickedJigFile | null> {
  const dialog = tauri()?.dialog
  if (!dialog?.open) throw new Error('当前环境不支持选择文件')

  const picked = await dialog.open({
    directory: false,
    multiple: false,
    title: '选择 MES 导出的 Excel',
    filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
    ...(defaultDir ? { defaultPath: defaultDir } : {})
  })

  if (!picked) return null
  const path = Array.isArray(picked) ? picked[0] : picked
  if (!path) return null

  return { path, name: basename(path) }
}

/**
 * 弹一个原生目录选择器。用户取消返回 null。
 *
 * JIG 页用它挑「源文件默认目录」与「导出默认目录」——
 * 都是**这台电脑**的属性，不进备份文件。
 */
export async function pickJigDirectory(
  current: string | null
): Promise<string | null> {
  const dialog = tauri()?.dialog
  if (!dialog?.open) throw new Error('当前环境不支持选择目录')

  const picked = await dialog.open({
    directory: true,
    multiple: false,
    title: '选择目录',
    ...(current ? { defaultPath: current } : {})
  })

  if (!picked) return null
  const path = Array.isArray(picked) ? picked[0] : picked
  return path ?? null
}

/**
 * 读一个用户选中的文件，返回字节。
 *
 * 走壳里自定义的 `read_picked_file` 命令，而不是 fs 插件：fs 的读权限被
 * 刻意限制在 `$DOWNLOAD` / `$DOCUMENT` 两个目录，而 MES 导出的文件通常
 * 在 D 盘或共享盘里。那个命令的能力面窄得多 —— 只读一个已存在的文件。
 */
export async function readPickedFile(path: string): Promise<Uint8Array> {
  const invoke = tauri()?.core?.invoke
  if (!invoke) throw new Error('当前环境不支持读取本地文件')
  return invoke<number[]>('read_picked_file', { path }).then(bytes => new Uint8Array(bytes))
}

/**
 * 能不能读系统剪贴板 —— **同步**判断，不发命令。
 *
 * 存在的理由是粘贴事件的时序：`preventDefault()` 只能在事件派发的同步阶段
 * 调用，一旦 await 过就来不及了（浏览器会先执行默认粘贴，之后再自己写一遍，
 * 内容就重复了）。所以「能不能读」必须在进 handler 前就知道 ——
 * 用「有没有插件」来判断，而不是「读没读到」。
 */
export function canReadClipboard(): boolean {
  return isTauriShell() && Boolean(tauri()?.core?.invoke)
}

/**
 * 读系统剪贴板里的文本；拿不到时返回 null。
 *
 * JIG 页的「粘贴 Jig ID」要能从邮件正文里自动挑出 ID ——
 * 那是系统级剪贴板的内容，网页拿不到：WebView2 里
 * `navigator.clipboard.readText` 在 onPaste 事件中基本必被拒绝
 * （需要额外的用户激活与权限），只有插件能读。
 *
 * 失败返回 null 而不抛错：界面据此退回「按原文粘贴」，不阻塞用户。
 */
export async function readClipboardText(): Promise<string | null> {
  const invoke = tauri()?.core?.invoke
  if (!invoke) return null
  try {
    const text = await invoke<string>('read_clipboard_text')
    return text ?? null
  } catch {
    return null
  }
}

/** 取路径的最后一段（文件名） */
export function basename(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

/** 取路径的目录部分（不含末尾分隔符） */
export function dirname(p: string): string {
  const parts = p.split(/[\\/]/)
  parts.pop()
  return parts.join('\\')
}
