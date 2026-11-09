/**
 * JIG 配置文件（壳里专属）。
 *
 * 位置：`<app_config_dir>/jig-config.json`（Windows 下在 %APPDATA% 的应用目录里）。
 * 结构：
 *
 * ```jsonc
 * {
 *   "version": 1,
 *   "config": { ...JigConfig },   // 业务配置：映射表、工序顺序、列序…
 *   "prefs":  { ...JigPrefs }     // 本机偏好：目录、行高、两个开关
 * }
 * ```
 *
 * 分工：**文件为准**；localStorage 只做 Web 静态版回退与启动初值。
 * 备份文件 v6 仍带 `jig` 段，导入备份会覆盖这里的 config。
 *
 * 浏览器 / 静态版没有文件能力：读写都安静地降级为 null / no-op。
 */

import { isTauriShell } from './env'
import { tauri } from './tauri'

/** 配置文件版本。结构变更时直接加一，旧文件按「不存在」处理。 */
const VERSION = 1

export interface JigConfigFile {
  version: number
  /** JigConfig 的原始 JSON；由调用方用 mergeJigConfig 归一化 */
  config?: unknown
  /** JigPrefs 的原始 JSON；由调用方用 mergeJigPrefs 归一化 */
  prefs?: unknown
}

/** 读配置。文件不存在、解析失败、版本不符都返回 null（调用方落回默认值）。 */
export async function readJigConfigFile(): Promise<JigConfigFile | null> {
  if (!isTauriShell()) return null
  const invoke = tauri()?.core?.invoke
  if (!invoke) return null

  try {
    const raw = await invoke<string | null>('read_jig_config')
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null

    const file = parsed as Partial<JigConfigFile>
    // 版本不符时不猜测结构，按「没有配置」处理；下次保存会写成当前版本
    if (file.version !== VERSION) return null
    return { version: VERSION, config: file.config, prefs: file.prefs }
  } catch {
    return null
  }
}

/** 整份写入。失败静默（配置写不进去不该阻断操作，界面已把状态改了）。 */
export async function writeJigConfigFile(file: JigConfigFile): Promise<void> {
  if (!isTauriShell()) return
  const invoke = tauri()?.core?.invoke
  if (!invoke) return

  await invoke('write_jig_config', {
    contents: JSON.stringify({ version: VERSION, config: file.config, prefs: file.prefs })
  }).catch(() => {})
}

/**
 * 只更新一部分，另一部分沿用文件里的现值（读-改-写）。
 *
 * config 由 App 管、prefs 由 useJigData 管，两边各自保存时不能把对方
 * 那一半覆盖成空 —— 所以写之前先读一次现有文件。
 */
export async function updateJigConfigFile(patch: {
  config?: unknown
  prefs?: unknown
}): Promise<void> {
  const current = await readJigConfigFile()
  await writeJigConfigFile({
    version: VERSION,
    config: patch.config !== undefined ? patch.config : current?.config,
    prefs: patch.prefs !== undefined ? patch.prefs : current?.prefs
  })
}
