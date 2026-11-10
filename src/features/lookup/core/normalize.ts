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
