/**
 * 剪贴板处理 —— 逻辑源自 v1.x 的 clipboard_processor.py
 *
 * 正则语义:
 *   - CJ + 8 位字母数字 + 末 2 位数字且不能是 "00"  (排除 Lot ID)
 *   - C4M + 9 位字母数字
 *   - 前后都不能紧邻字母数字 / 下划线 / 连字符
 *     （`ABC-CJJ…`、`X_CJJ…` 说明它是更长编码的一段，不该被当成独立 ID）
 *
 * 匹配前先做两件事：
 *   1. NFKC 归一化 —— 邮件正文里常混入全角字母数字，不归一化会漏掉
 *      看起来完全正常的 ID；
 *   2. 去掉零宽字符（零宽空格 / 连接符 / BOM / 软连字符）—— 复制粘贴时
 *      它们经常被插进编码中间，肉眼完全看不出来。
 *
 * 匹配不区分大小写，输出统一大写：MES 源数据是大写，用户从邮件里复制到
 * 小写时也能查得到。原文不会被改写 —— 归一化只用于匹配。
 *
 * 注意 JS 与 Python 正则的差异: 这里使用 ES2018 起的 lookbehind，
 * Tauri 的 WebView2 与 Node 测试环境均支持。
 */

/** 零宽字符：零宽空格 / 零宽非连接 / 零宽连接 / BOM / 软连字符 */
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u00AD]/g

/** 归一化：全角转半角 + 去零宽字符。只用于匹配，不改变界面里的原文。 */
function normalizeText(text: string): string {
  return text.normalize('NFKC').replace(ZERO_WIDTH, '')
}

const JIG_ID_GLOBAL =
  /(?<![A-Za-z0-9_-])(?:CJ[A-Z0-9]{8}(?!00)[0-9]{2}|C4M[A-Z0-9]{9})(?![A-Za-z0-9_-])/gi
const JIG_ID_FULL = /^(?:CJ[A-Z0-9]{8}(?!00)[0-9]{2}|C4M[A-Z0-9]{9})$/i

/** 从混合文本中提取所有符合条件的 JIG ID, 去重且保持原始顺序 */
export function extractJigIds(text: string): string[] {
  if (!text) return []

  const seen = new Set<string>()
  const result: string[] = []
  for (const m of normalizeText(text).matchAll(JIG_ID_GLOBAL)) {
    // 统一大写：小写输入也能命中源数据，且不会与同一 ID 的大写形式重复
    const id = m[0].toUpperCase()
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

  const lines = normalizeText(text).trim().split(/\r?\n/)
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
 * 1. 纯净 JIG ID 列表 -> 归一化后原样返回 (不去重)
 * 2. 含 JIG ID 的混合文本 -> 提取后每行一个返回
 * 3. 不含 JIG ID -> 原样返回
 */
export function processClipboardContent(text: string): string {
  if (!text) return text
  const normalized = normalizeText(text)
  if (isPureJigIds(normalized)) return normalized

  const ids = extractJigIds(normalized)
  if (ids.length > 0) return ids.join('\n')

  return text
}

/**
 * 校验单个 ID（允许大小写与全角写法）。
 *
 * 重新提取用于粘贴时追加, 避免覆盖已有内容。
 */
export function isValidJigId(id: string): boolean {
  return JIG_ID_FULL.test(normalizeText(id).trim())
}

/**
 * 把输入框里的每一行整理成可查询的 ID 列表。
 *
 * - 逐行归一化（NFKC / 去零宽 / 去首尾空白 / 大写）
 * - 丢掉认不出的行，并返回被丢掉的行数（界面用来说明「忽略了 N 行」）
 * - 按出现顺序去重 —— 纯 ID 列表粘贴时可能带重复行，查询前必须收敛，
 *   否则明细里会出现重复行、命中/未找到的统计也会翻倍
 */
export function prepareQueryIds(lines: ReadonlyArray<string>): {
  ids: string[]
  ignored: number
} {
  const seen = new Set<string>()
  const ids: string[] = []
  let ignored = 0

  for (const raw of lines) {
    const id = normalizeText(raw).trim().toUpperCase()
    if (!id) continue
    if (!JIG_ID_FULL.test(id)) {
      ignored += 1
      continue
    }
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }

  return { ids, ignored }
}
