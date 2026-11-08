import { useCallback, useEffect, useState } from 'react'

import {
  applyTheme,
  getThemePreference,
  resolveTheme,
  setThemePreference,
  subscribeTheme,
  type ResolvedTheme,
  type ThemePreference
} from '../platform/theme'

/**
 * 主题状态：偏好（三态）+ 解析后的实际主题（两态）。
 *
 * 偏好与实际主题要分开看：选「跟随系统」时，实际主题由系统决定，
 * 界面上的开关显示的也是「实际主题」，而不是偏好本身。
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => getThemePreference())
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(getThemePreference()))

  // 挂载时把主题写到根节点（首帧之前已由 index.html 的内联脚本处理过一次，
  // 这里是为了首帧之后的一致性与「跟随系统」的即时响应）
  useEffect(() => {
    applyTheme(resolved)
    return subscribeTheme(next => setResolved(next))
  }, [resolved])

  const change = useCallback((next: ThemePreference) => {
    setPreference(next)
    setThemePreference(next)
    setResolved(resolveTheme(next))
  }, [])

  /** 一键在浅色 / 深色之间切换（顶栏按钮用） */
  const toggle = useCallback(() => {
    change(resolved === 'dark' ? 'light' : 'dark')
  }, [change, resolved])

  return { preference, resolved, change, toggle }
}
