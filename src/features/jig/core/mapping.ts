/**
 * 型号 -> 尺寸映射表的编辑逻辑
 *
 * 单独抽出来是因为 SettingsDialog / SizeMappingDialog 里的输入校验
 * 必须能被单测覆盖: 这张表一旦有一条错误, 整个「对应尺寸」列和标红
 * 结果都会错, 而错的表现往往在几百行之后才看得出来, 很难定位。
 *
 * 底层类型是 Record<string, string>, 也就是一个 key 只能有一个值。
 * 用户在面板里加两行相同型号是最容易犯的错, 而 JS 对象赋值不会报错,
 * 只是后者覆盖前者 —— 面板必须自己拦下来。
 */

/** 面板里的一行: 型号与对应尺寸 */
export interface MappingPair {
  model: string
  size: string
}

/** 行下标 -> 错误信息。空对象表示全部合法。 */
export type MappingErrors = Record<number, string>

/** 从配置对象还原成面板可编辑的行数组 */
export function mappingToPairs(mapping: Record<string, string>): MappingPair[] {
  return Object.entries(mapping).map(([model, size]) => ({ model, size }))
}

/**
 * 同上, 但按 order 指定的顺序还原。
 *
 * 这是面板读配置的入口。之所以不能直接用 mappingToPairs: 绝大多数型号是
 * 纯数字 ('184' '252' '508'), 而 JS 对象会把数组索引样式的键按数值升序
 * 排在字符串键之前 —— 面板里用户排好的 '252' 在前, 存进 Record 之后再读
 * 出来必然变成 '184' 打头、纯数字全部升序。顺序必须单独存一份。
 *
 * order 里缺失的型号 (旧配置 / 用户后加的) 追加到末尾, 不丢规则。
 */
export function orderedPairs(
  mapping: Record<string, string>,
  order: ReadonlyArray<string>,
): MappingPair[] {
  const rest = Object.keys(mapping).filter((m) => !order.includes(m))
  return [...order, ...rest]
    .filter((m) => m in mapping)
    .map((model) => ({ model, size: mapping[model] }))
}

/** 行数组 -> 配置对象。逐行 trim, 保持键的大小写原样。 */
export function pairsToMapping(pairs: ReadonlyArray<MappingPair>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of pairs) {
    const model = p.model.trim()
    if (!model) continue
    out[model] = p.size.trim()
  }
  return out
}

/**
 * 校验每一行, 返回行下标到错误信息的映射。
 *
 * 尺寸串允许为空 —— 映射到空串时 validateSizeMatch 规则 2 会判成
 * "匹配", 也就是"这一型号不做尺寸校验"。有些 JIG 确实没有尺寸概念,
 * 显式写成空串比删掉这行更清楚。
 */
export function validateMappingPairs(pairs: ReadonlyArray<MappingPair>): MappingErrors {
  const errors: MappingErrors = {}
  // 已用型号 -> 首次出现的行下标, 用于报"重复在第几行"
  const seen = new Map<string, number>()

  pairs.forEach((p, i) => {
    const model = p.model.trim()
    if (!model) {
      errors[i] = '型号不能为空'
      return
    }
    const first = seen.get(model)
    if (first !== undefined) {
      errors[i] = `型号 ${model} 与第 ${first + 1} 行重复`
      return
    }
    seen.set(model, i)
  })

  return errors
}

/** 面板里新增一行时用的空行 */
export function blankPair(): MappingPair {
  return { model: '', size: '' }
}

/**
 * 把第 from 行挪到第 to 行, 返回新数组。
 *
 * 要点: 越界时**返回原数组**而不是副本。面板里上下移动的行首尾按钮
 * 在端点处必然要点得到, 若每次都生成新数组, useMemo 的依赖每点一次就
 * 变一次, 整张表会跟着重渲 —— 而视觉上什么都没有发生。
 */
export function movePair(
  pairs: ReadonlyArray<MappingPair>,
  from: number,
  to: number,
): MappingPair[] {
  if (from === to) return pairs as MappingPair[]
  if (from < 0 || to < 0 || from >= pairs.length || to >= pairs.length) {
    return pairs as MappingPair[]
  }

  const next = [...pairs]
  const [row] = next.splice(from, 1)
  next.splice(to, 0, row)
  return next
}