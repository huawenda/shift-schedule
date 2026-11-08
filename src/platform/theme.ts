/**
 * 主题：浅色 / 深色 / 跟随系统。
 *
 * 三态存在 localStorage（键与备份数据分开，只属于「这台电脑」的偏好）。
 * 生效方式有两处，缺一不可：
 *   1. `documentElement.dataset.theme = 'dark'` —— 项目自己的令牌走
 *      `[data-theme='dark']` 覆盖块（见 src/styles/tokens.scss）。
 *   2. `documentElement.classList.add('dark')` —— shadcn 的 `--ui-*` 变量与
 *      Tailwind 的 `dark:` 变体都挂在 `.dark` 上（见 src/index.css）。
 *
 * 页面首帧之前必须先定好主题，否则会闪一下白：
 * index.html 的 head 里有一段等价的内联脚本先跑一遍，本模块只负责之后的切换。
 */

import { STORAGE_KEYS, readRaw, writeRaw } from './storage'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** 画布底色：与 tokens.scss 的 --canvas 保持一致，PWA 状态栏跟着它走 */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#ffffff',
  dark: '#0f1318'
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function getThemePreference(): ThemePreference {
  const raw = readRaw(STORAGE_KEYS.theme)
  // 没设过就用「浅色」而不是「跟随系统」：
  // 本应用默认是浅色（DESIGN.md §8），系统暗色下自动变暗会让第一次打开的人
  // 看到一张没见过的界面。要跟系统走，在设置 → 个人资料 → 外观里改。
  return isThemePreference(raw) ? raw : 'light'
}

export function setThemePreference(preference: ThemePreference): void {
  writeRaw(STORAGE_KEYS.theme, preference)
  applyTheme(resolveTheme(preference))
}

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(DARK_QUERY).matches
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return preference
}

/** 把解析后的主题写到根节点上，并同步 PWA 状态栏色 */
export function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle('dark', theme === 'dark')

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = THEME_COLOR[theme]
}

/** 订阅主题变化：跟随系统时，系统切深浅色要立刻反映到界面上 */
export function subscribeTheme(listener: (theme: ResolvedTheme) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}

  const media = window.matchMedia(DARK_QUERY)
  const onChange = () => {
    if (getThemePreference() === 'system') {
      const resolved = resolveTheme('system')
      applyTheme(resolved)
      listener(resolved)
    }
  }

  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
