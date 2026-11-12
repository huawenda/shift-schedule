/**
 * 查询键归一化。
 *
 * 现场录入会遇到全角、空格、大小写混写：`ｆｙ`、`31（10）`、`7748g`。
 * NFKC 把全角括号/字母收回半角，再去掉所有空白，最后统一大写 ——
 * 型号、JIG P/N、Recipe 三种键共用这一套。
 */
export function normalizeKey(input: string): string {
  return input.normalize('NFKC').replace(/\s+/g, '').toUpperCase()
}

/**
 * 匹配打分：0 = 完全相等，1 = 前缀，2 = 包含，−1 = 不匹配。
 *
 * 放在 normalize 里而不是 indexes / entities 里：型号、JIG、实体候选
 * 三处都要用同一套顺序，各写一份迟早漂移。两处调用方都只依赖这一个纯函数。
 */
export function matchScore(value: string, query: string): number {
  if (value === query) return 0
  if (value.startsWith(query)) return 1
  if (value.includes(query)) return 2
  return -1
}
