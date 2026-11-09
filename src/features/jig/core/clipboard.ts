/**
 * 剪贴板处理 —— 逻辑源自 v1.x 的 clipboard_processor.py
 *
 * 正则语义与 Python 保持一致:
 *   - CJ + 8位字母数字 + 末2位数字且不能是 "00"  (排除 Lot ID)
 *   - C4M + 9位字母数字
 *   - 前后都不能紧邻字母数字 (负向前后查找)
 *
 * 注意 JS 与 Python 正则的差异: JS 的 String.match 不支持 (?<!) 在部分
 * 旧引擎上, 这里使用 ES2018 起的 lookbehind, Tauri 的 WebView2 与
 * Node 测试环境均支持。
 */

const JIG_ID_GLOBAL = /(?<![A-Za-z0-9])(CJ[A-Z0-9]{8}(?!00)[0-9]{2}|C4M[A-Z0-9]{9})(?![A-Za-z0-9])/g
const JIG_ID_FULL = /^(CJ[A-Z0-9]{8}(?!00)[0-9]{2}|C4M[A-Z0-9]{9})$/

/** 从混合文本中提取所有符合条件的 JIG ID, 去重且保持原始顺序 */
export function extractJigIds(text: string): string[] {
  if (!text) return []

  const seen = new Set<string>()
  const result: string[] = []
  for (const m of text.matchAll(JIG_ID_GLOBAL)) {
    const id = m[0]
    if (!seen.has(id)) {
      seen.add(id)
      result.push(id)
    }
  }
  return result
}

/** 判断文本是否为纯净的 JIG ID 列表 (每行一个, 允许空行和首尾空白) */
export function isPureJigIds(text: string): boolean {
  if (!text) return false

  const lines = text.trim().split('\n')
  let hasNonEmpty = false

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    hasNonEmpty = true
    if (!JIG_ID_FULL.test(line)) return false
  }

  return hasNonEmpty
}

/**
 * 主入口: 决定返回提取结果还是原始文本。
 * 1. 纯净 JIG ID 列表 -> 原样返回 (不去重)
 * 2. 含 JIG ID 的混合文本 -> 提取后每行一个返回
 * 3. 不含 JIG ID -> 原样返回
 */
export function processClipboardContent(text: string): string {
  if (!text) return text
  if (isPureJigIds(text)) return text

  const ids = extractJigIds(text)
  if (ids.length > 0) return ids.join('\n')

  return text
}

/** 重新提取用于粘贴时追加, 避免覆盖已有内容 */
export function isValidJigId(id: string): boolean {
  return JIG_ID_FULL.test(id.trim())
}