/**
 * 本机存储：优先 localStorage，不可用时退化为内存。
 *
 * file:// 与隐私模式下 localStorage 可能抛异常，此时页面仍能跑，
 * 只是刷新会丢数据 —— 上层据此显示提示条并催促导出备份。
 */

const memoryFallback = new Map<string, string>()

const probeKey = 'shift-schedule:local:probe'

export const STORAGE_KEYS = {
  /**
   * 唯一的业务数据：整套花名册（成员 + 自建班序 + 改班/加班记录）。
   *
   * 键名里的 `v2` 是历史遗留（当时从「按姓名索引的日记录」换成「按 memberId 的整套花名册」），
   * 与备份文件的 `version` 不是同一个编号体系，别按它推断备份格式版本。
   */
  roster: 'shift-schedule:local:roster:v2',
  /**
   * 备份的默认存放目录（绝对路径）。
   *
   * **刻意不放进 roster**：路径是「这台电脑」的属性，跟着备份文件换机器只会指到
   * 一个不存在的目录。所以它单独一个键，也不进导出的 JSON。
   */
  backupDir: 'shift-schedule:local:backup-dir:v1',
  /**
   * 关闭主窗口的行为（`exit` / `tray`）。
   *
   * 和备份目录一样属于「这台电脑」的偏好，不进备份文件，也不跟着换机器走。
   */
  closeBehavior: 'shift-schedule:local:close-behavior:v1',
  /**
   * 外观偏好（`system` / `light` / `dark`）。
   *
   * 同样属于「这台电脑」的偏好，不进备份文件 —— 换台电脑时按系统走就行，
   * 把某台机器的深色设定跟着数据搬过去反而别扭。
   */
  theme: 'shift-schedule:local:theme:v1',
  /**
   * 侧栏展开时的宽度（px，字符串存）。
   *
   * 与折叠状态分开：shadcn 自己用 cookie 记 `sidebar_state`（是否折叠），
   * 这里只记「展开时多宽」。同样不进备份文件 —— 换台机器屏幕尺寸不同，
   * 搬过去反而不合适。
   */
  sidebarWidth: 'shift-schedule:local:sidebar-width:v1',
  /**
   * JIG 源 Excel 的默认目录（绝对路径）。
   *
   * 与 backupDir 同一档：路径是「这台电脑」的属性 —— 换台电脑时
   * 车间共享盘的挂载点未必一样，跟着备份文件搬过去反而指到不存在的目录。
   * 所以单独一个键，也不进导出的 JSON。
   */
  jigSourceDir: 'shift-schedule:local:jig-source-dir:v1',

  /**
   * JIG 导出的默认目录（绝对路径）。
   *
   * 与 jigSourceDir 同一档：路径是「这台电脑」的属性。
   */
  jigExportDir: 'shift-schedule:local:jig-export-dir:v1',

  /**
   * 导出文件名是否加时间戳（'1' = 开）。
   *
   * 同样不进备份 —— 换个习惯不该跟着备份文件跑到别的机器上。
   */
  jigExportTimestamp: 'shift-schedule:local:jig-export-timestamp:v1',

  /**
   * 粘贴时是否自动从混合文本里挑出 JIG ID（'1' = 开）。
   */
  jigClipboardProcess: 'shift-schedule:local:jig-clipboard-process:v1',

  /** JIG 表格行高（px，字符串存）。本机偏好，Web 静态版靠它记住。 */
  jigRowHeight: 'shift-schedule:local:jig-row-height:v1',

  /**
   * JIG 的业务配置（型号→尺寸映射、工序顺序等）。
   *
   * **业务配置却存在 localStorage 里**，看起来矛盾 —— 原因是它**同时**进备份文件
   * （换机器要带走），而 localStorage 这份是为了「这台机器上关掉再打开还在」。
   * 备份文件是权威来源：导入备份会覆盖这里。
   *
   * 键名里的 `v1` 与备份文件的 `version` 不是同一个编号体系。
   */
  jigConfig: 'shift-schedule:local:jig-config:v1'
} as const

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readRaw(key: string): string | null {
  try {
    const storage = getBrowserStorage()
    if (storage) return storage.getItem(key)
  } catch {
    // 落到内存兜底
  }
  return memoryFallback.get(key) ?? null
}

/** 返回是否真正写进了持久化存储（false 表示只进了内存） */
export function writeRaw(key: string, value: string): boolean {
  try {
    const storage = getBrowserStorage()
    if (storage) {
      storage.setItem(key, value)
      return true
    }
  } catch {
    // 落到内存兜底
  }
  memoryFallback.set(key, value)
  return false
}

export function removeRaw(key: string): void {
  try {
    const storage = getBrowserStorage()
    if (storage) storage.removeItem(key)
  } catch {
    // 忽略
  }
  memoryFallback.delete(key)
}

/** 当前环境能否真正持久化 */
export function isPersistenceAvailable(): boolean {
  try {
    const storage = getBrowserStorage()
    if (!storage) return false
    storage.setItem(probeKey, '1')
    storage.removeItem(probeKey)
    return true
  } catch {
    return false
  }
}
