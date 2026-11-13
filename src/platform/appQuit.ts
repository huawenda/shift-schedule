import { tauri } from './tauri'

/**
 * 真正结束进程（不是「隐藏到托盘」）。
 *
 * 侧栏用户菜单里的「退出应用」用它：关闭按钮的行为可以被用户设成
 * 「隐藏到托盘」，但菜单里那句「退出」的意思是结束进程，不能被那个偏好改掉。
 *
 * 走的是壳里自注册的 `quit_app` 命令（`app.exit(0)`），不需要额外的插件。
 * 浏览器 / 静态版没有进程可退，返回 false 由调用方决定怎么提示。
 */
export async function quitApp(): Promise<boolean> {
  const invoke = tauri()?.core?.invoke
  if (!invoke) return false
  await invoke('quit_app')
  return true
}
