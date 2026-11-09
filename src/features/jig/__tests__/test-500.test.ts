/**
 * 校验 test-500.xlsx 的覆盖面与正确性。
 *
 * ## 两份输入
 *
 *   test-500.xlsx                     源数据 (本地生成, .gitignore 排除)
 *   tests/fixtures/jig-exceptions.json 每行的期望红绿与分组意图
 *
 * 为什么期望值放在 JSON 里而不是本文件里手写: 500 行的红绿取决于
 * (P/N, 型号) 两者, 手写不现实; 而"用生产代码推导期望"就成了
 * 自己验证自己。折中办法是**把生成时的构造意图导出成夹具** ——
 * 期望值来自分组设计, 不是来自被测函数的输出。
 *
 * 判定仍然直接调用 src/core 的 validateSizeMatch, 不在校验脚本里复刻规则
 * —— 复刻会引入第二份逻辑, 两份一旦漂移, 校验就成了自说自话。
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx-js-style'
import { validateSizeMatch, rulesFromConfig } from '../core/validate'
import { createDefaultJigConfig } from '../core/config'
import { generatePivot } from '../core/pivot'
import { extractJigIds } from '../core/clipboard'

// ---------------------------------------------------------------------------
// 夹具加载
// ---------------------------------------------------------------------------

interface Fixture {
  rowCount: number
  pnList: string[]
  groups: {
    name: string
    /** 该组对应的 CST —— 一组 = 一个 CST 的 20 层; 未绑定时为空串 */
    cst: string
    /** 与 CST 一一对应的 Lot */
    lot: string
    pn: string
    model: string
    /** 该 CST 当前所在工序 (每个 CST 唯一) */
    engineering: string
    engineeringCode: string
    rows: number
    /** 这个 LOT 是否挂在 CST 上。false 只出现在 Jig Loading */
    bonded: boolean
    expectRed: boolean
    jigIds: string[]
  }[]
}

const XLSX_PATH = resolve(__dirname, 'fixtures', 'test-500.xlsx')
const JSON_PATH = resolve(__dirname, 'fixtures', 'jig-exceptions.json')

// test-500.xlsx 是生成产物且被 .gitignore 排除, 新克隆下来的仓库里没有它。
// 裸 ENOENT 看不出该做什么, 这里换成一句可执行的提示。
function readFixtureXlsx(): Buffer {
  try {
    return readFileSync(XLSX_PATH)
  } catch {
    throw new Error(
      `找不到 ${XLSX_PATH}\n` +
        '这是 500 行 MES 导出夹具, 应随本目录一起提交。',
    )
  }
}

const fixture = JSON.parse(readFileSync(JSON_PATH, 'utf8')) as Fixture
const wb = XLSX.read(readFixtureXlsx())
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], {
  raw: false,
  defval: '',
})

const cfg = createDefaultJigConfig()
const rules = rulesFromConfig(cfg)

const strRows = rows.map((r) => {
  const o: Record<string, string> = {}
  for (const [k, v] of Object.entries(r)) o[k] = String(v ?? '')
  return o
})
const rowById = new Map(strRows.map((r) => [r['Jig ID'], r]))
const idToGroup = new Map<string, Fixture['groups'][number]>()
for (const g of fixture.groups) for (const id of g.jigIds) idToGroup.set(id, g)

// 复用生产代码生成透视表, 不在校验脚本里复刻一遍列序逻辑。
const active = strRows.filter((r) => r['Jig状态'] === cfg.jigStatusActiveValue)
const pivot = generatePivot(active, false, cfg)

/** 取一行的「对应尺寸」映射值 */
function mappedSize(row: Record<string, string>): string {
  const model = row['Jig 对应型号'].split(/\s+/)[0]
  return cfg.jigSizeMapping[model] ?? ''
}

/** 该行是否应当标红 —— 严格 4 位尺寸匹配 */
function isRed(row: Record<string, string>): boolean {
  return !validateSizeMatch(row['P/N'], mappedSize(row), rules)
}

describe('test-500.xlsx', () => {
  // -------------------------------------------------------------------------
  // 基础结构
  // -------------------------------------------------------------------------

  it('有 500 行数据', () => {
    expect(rows.length).toBe(500)
    expect(rows.length).toBe(fixture.rowCount)
  })

  it('列序与真实导出完全一致, 含末尾的 Jig状态', () => {
    expect(Object.keys(rows[0])).toEqual([
      'P/N', 'Lot ID', 'CST ID', 'Slot No', 'Jig ID',
      'Jig 对应型号', 'Glass判定', '工程', '工程名', 'Jig状态',
    ])
  })

  it('Jig状态 覆盖在产与已入库, 审查页应只显示在产部分', () => {
    const states = new Set(rows.map((r) => r['Jig状态']))
    expect(states.has(cfg.jigStatusActiveValue)).toBe(true)
    expect(states.size).toBeGreaterThan(1)
    const inProd = rows.filter((r) => r['Jig状态'] === cfg.jigStatusActiveValue).length
    expect(inProd).toBeGreaterThan(0)
    expect(inProd).toBeLessThan(rows.length)
  })

  it('覆盖 engineeringConfig 的全部 11 道工序', () => {
    const present = new Set(rows.map((r) => r['工程名'] as string))
    for (const stage of Object.keys(cfg.engineeringConfig)) {
      expect(present.has(stage), `缺少工序 ${stage}`).toBe(true)
    }
    expect(present.size).toBe(11)
  })

  it('主力三道工序合计 70%, 其余 8 道合计 30%', () => {
    // 现场大部分 JIG 堆在前三道 (PNP / Jig Loading / Jig 洗净及检查),
    // 后面的工序在制品少。70 : 30 是照着实际分布定的。
    const main = ['PNP', 'Jig Loading', 'Jig 洗净及检查']
    let mainRows = 0
    for (const r of strRows) {
      if (main.includes(r['工程名'])) mainRows += 1
    }
    expect(mainRows / strRows.length, `主力三道 ${mainRows} / ${strRows.length}`)
      .toBeCloseTo(0.7, 6)
  })

  it('PNP 2nd 排在 PNP 与 Jig 洗净及检查之间', () => {
    const orders = Object.entries(cfg.engineeringConfig)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([name]) => name)
    const iPnp = orders.indexOf('PNP')
    const i2nd = orders.indexOf('PNP 2nd')
    const iWash = orders.indexOf('Jig 洗净及检查')
    expect(iPnp).toBeGreaterThanOrEqual(0)
    expect(i2nd).toBeGreaterThanOrEqual(0)
    expect(iWash).toBeGreaterThanOrEqual(0)
    expect(iPnp).toBeLessThan(i2nd)
    expect(i2nd).toBeLessThan(iWash)
  })

  it('透视表的列序与工序顺序一致', () => {
    const order = new Map(
      Object.entries(cfg.engineeringConfig).map(([k, v]) => [k, v.order]),
    )
    const nonStage = new Set(['P/N', 'CST ID', cfg.keywordTotal])
    const stages = pivot.columns.filter((c) => !nonStage.has(c))
    expect(stages.length).toBe(Object.keys(cfg.engineeringConfig).length)
    const rank = stages.map((s) => {
      const r = order.get(s)
      expect(r, `列 ${s} 不在 engineeringConfig 里, 会被排到最后`).toBeDefined()
      return r as number
    })
    for (let i = 1; i < rank.length; i++) {
      expect(rank[i - 1], `第 ${i} 列 ${stages[i]} 排在了 ${stages[i - 1]} 之后`)
        .toBeLessThanOrEqual(rank[i])
    }
  })

  it('工程号覆盖多个, 且包含生产中判定值 50000', () => {
    const codes = new Set(rows.map((r) => String(r['工程'])))
    expect(codes.size).toBeGreaterThan(1)
    expect(codes.has(cfg.productionIndicatorCode)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // P/N 命名规则与型号白名单
  //
  // 把规则钉在测试侧: 将来有人往 gen-test-xlsx.py 里加一个不符合真实编码
  // 规则的 P/N, 或随手填一个不在 jigSizeMapping 里的型号, 这里会先炸出来。
  //
  // 型号白名单尤其要独立校验 —— 型号查不到映射时对应尺寸是空串, 而
  // validateSizeMatch 规则 2 把空值判成"匹配", 于是未登记的型号会静默地
  // 变成"永远不标红", 标红回归直接失去意义。
  // -------------------------------------------------------------------------

  /*
   * P/N 编码规则 (现场规则, 见 docs/domain-rules.md 第四节)。
   *
   * 关键: **尺寸码决定前缀与可用后缀**, 三段不是自由组合。按三段分别
   * 白名单校验是不够的 —— 那样 `6072J-6555H` 这种现场不存在的编码也能
   * 通过, 而 validateSizeMatch 只看第 7~10 位, 前缀后缀错了在界面上
   * 一点也看不出来。
   */
  const PN_RULES: Record<string, { prefix: string; suffixes: string }> = {
    '6555': { prefix: '6073J', suffixes: 'BCDEFGH' },
    '7748': { prefix: '6072J', suffixes: 'BCDEFG' },
    '8348': { prefix: '6072J', suffixes: 'BCFG' },
    '7727': { prefix: '6073J', suffixes: 'C' },
    '3931': { prefix: '6073J', suffixes: 'C' },
    '7742': { prefix: '6072J', suffixes: 'BC' },
  }

  it('每个 P/N 都符合现场编码规则 (前缀与后缀必须与该尺寸码匹配)', () => {
    const pns = [...new Set(rows.map((r) => String(r['P/N'])))]
    for (const pn of pns) {
      const m = /^(6072J|6073J)-(\d{4})([A-Z])$/.exec(pn)
      expect(m, `P/N ${pn} 不符合 <前缀>-<4位码><后缀> 的形态`).not.toBeNull()
      const [, prefix, code, suffix] = m!
      const rule = PN_RULES[code]
      expect(rule, `尺寸码 ${code} 不在白名单里`).toBeDefined()
      expect(prefix, `${pn} 的前缀应为 ${rule.prefix}, 该码只在这个前缀下出现`)
        .toBe(rule.prefix)
      expect(rule.suffixes.includes(suffix), `${pn} 的后缀 ${suffix} 不属于该码的合法后缀 ${rule.suffixes}`)
        .toBe(true)
    }
  })

  it('尺寸码不超过 2 类, 尾缀不超过 3 类 (现场实际分布)', () => {
    // 现场不会同时做很多规格 —— 这是"像不像真实导出"的关键指标之一。
    const pns = [...new Set(strRows.map((r) => r['P/N']))]
    const codes = [...new Set(pns.map((pn) => pn.slice(6, 10)))]
    const suffixes = [...new Set(pns.map((pn) => pn.slice(-1)))]
    expect(codes.length, `尺寸码有 ${codes.length} 类: ${codes.join(', ')}`)
      .toBeLessThanOrEqual(2)
    expect(suffixes.length, `尾缀有 ${suffixes.length} 类: ${suffixes.join(', ')}`)
      .toBeLessThanOrEqual(3)

    // 每一类都要有红有绿, 否则这一类等于没测
    for (const code of codes) {
      const reds = fixture.groups
        .filter((g) => g.pn.slice(6, 10) === code)
        .map((g) => g.expectRed)
      expect(reds.some(Boolean), `尺寸码 ${code} 没有红色用例`).toBe(true)
      expect(reds.some((r) => !r), `尺寸码 ${code} 没有绿色用例`).toBe(true)
    }
  })

  it('P/N 不与现场规则冲突: K 后缀不存在, 前缀与码一一绑定', () => {
    const pns = [...new Set(rows.map((r) => String(r['P/N'])))]
    // K 曾是早期生成器用的"自由后缀", 现场任何码都没有它
    expect(pns.some((pn) => pn.endsWith('K')), '出现了不存在的 K 后缀').toBe(false)
    // 6555 只在 6073J 下, 7748/8348/7742 只在 6072J 下
    for (const pn of pns) {
      const code = pn.slice(6, 10)
      const rule = PN_RULES[code]
      if (rule) expect(pn.startsWith(rule.prefix)).toBe(true)
    }
  })

  it('型号全部来自 jigSizeMapping, 不出现规则之外的型号', () => {
    for (const r of rows) {
      const model = String(r['Jig 对应型号']).split(' ')[0]
      expect(
        Object.prototype.hasOwnProperty.call(cfg.jigSizeMapping, model),
        `型号 ${model} 不在 jigSizeMapping 里`,
      ).toBe(true)
    }
  })

  it('多种尺寸映射都被覆盖 —— All Size 与多规格串都在', () => {
    const sizes = strRows.map(mappedSize)
    expect(sizes.some((s) => s === cfg.allSizeValue)).toBe(true)
    expect(sizes.some((s) => s === '')).toBe(false)
    expect(new Set(sizes).size).toBeGreaterThanOrEqual(4)
  })

  // -------------------------------------------------------------------------
  // 红绿契约
  // -------------------------------------------------------------------------

  it('每行红绿与 gen-test-xlsx.py 的分组意图逐行吻合', () => {
    const mismatches: string[] = []
    let red = 0
    for (const g of fixture.groups) {
      for (const id of g.jigIds) {
        const row = rowById.get(id)
        if (!row) {
          mismatches.push(`${id} 不在源数据里`)
          continue
        }
        const actual = isRed(row)
        if (actual) red++
        if (actual !== g.expectRed) {
          mismatches.push(
            `[${g.name}] ${id} 型号=${row['Jig 对应型号'].split(/\s+/)[0]} P/N=${row['P/N']} ` +
              `实际=${actual ? '红' : '不红'} 期望=${g.expectRed ? '红' : '不红'}`,
          )
        }
      }
    }
    expect(mismatches).toEqual([])
    expect(red).toBeGreaterThan(0)
    expect(red).toBeLessThan(rows.length)
  })

  // -------------------------------------------------------------------------
  // 其它覆盖面
  // -------------------------------------------------------------------------

  it('多数 Jig ID 能被剪贴板正则提取出来', () => {
    const text = rows.map((r) => r['Jig ID']).join('\n')
    // 刻意留了 D8A 前缀 —— 真实导出里也存在这类提取不到的 JIG,
    // 所以不追求 100%。
    expect(extractJigIds(text).length / rows.length).toBeGreaterThan(0.7)
  })

  it('Jig ID 互不重复', () => {
    expect(new Set(rows.map((r) => r['Jig ID'])).size).toBe(500)
  })

  // -------------------------------------------------------------------------
  // 装载约束 —— 现场的物理事实
  //
  // 这一类错误最不容易被发现: 界面照常渲染、红绿照常判定, 只是这份数据
  // 在产线上不可能存在。所以每条都要单独钉住。
  // -------------------------------------------------------------------------

  it('CST 落在现场编码范围内 (D8CCST500001–500040)', () => {
    // 空值不参与这一条 —— LOT 在 Jig Loading 阶段可以脱离 CST
    const csts = [...new Set(strRows.map((r) => r['CST ID']).filter(Boolean))]
    expect(csts.length).toBeGreaterThan(0)
    expect(csts.length, '现场一共只有 40 个 CST').toBeLessThanOrEqual(40)
    for (const cst of csts) {
      expect(/^D8CCST5000(0[1-9]|[1-3]\d|40)$/.test(cst), `${cst} 超出 500001–500040`)
        .toBe(true)
    }
  })

  it('LOT 永不为空; CST 为空只允许出现在 Jig Loading', () => {
    // LOT 是信息合集, 空则无意义; CST 只是实物载体, 尚未上载时可以没有。
    // 但一旦上了载 (Jig Loading 之后), CST 就必须存在 —— 否则"这块板
    // 现在在哪一层"无从回答。
    let unbonded = 0
    for (const r of strRows) {
      expect(r['Lot ID'], `${r['Jig ID']} 缺 Lot ID`).not.toBe('')
      if (r['CST ID'] === '') {
        unbonded += 1
        expect(r['工程名'], `${r['Jig ID']} 在「${r['工程名']}」缺 CST`).toBe('Jig Loading')
      }
    }
    // 这条路径必须真的被覆盖到, 否则"回填"只在单测里测过
    expect(unbonded, '没有任何 LOT 脱离 CST —— 回填路径在整表数据上没被覆盖')
      .toBeGreaterThan(0)
  })

  it('一层一块 JIG: 按回填后的载体计, (CST, Slot) 全局唯一', () => {
    // 空 CST 会被 pivot.ts 用 Lot ID 回填, 这里用同一口径 ——
    // 否则两个未绑定 CST 的 LOT 会在 ('' , slot 1) 上互相"撞车"。
    const seen = new Map<string, number>()
    for (const r of strRows) {
      const carrier = r['CST ID'] || r['Lot ID']
      const key = `${carrier} | slot ${r['Slot No']}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    const dup = [...seen.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k} x${n}`)
    expect(dup, `这些槽位装了不止一块 JIG`).toEqual([])
  })

  it('每个载体不超过 20 层, slot 从 1 起连续且不重复', () => {
    // 一台 CST 最多 20 层 (1–20)。未满载是正常的: 现场不会每台都装满,
    // 本文件里 350 行 / 150 行的比例就是靠两个 10 层的 CST 凑出来的。
    const byCarrier = new Map<string, number[]>()
    for (const r of strRows) {
      const carrier = r['CST ID'] || r['Lot ID']
      if (!byCarrier.has(carrier)) byCarrier.set(carrier, [])
      byCarrier.get(carrier)!.push(Number(r['Slot No']))
    }
    expect(byCarrier.size).toBeGreaterThan(0)
    for (const [carrier, slots] of byCarrier) {
      expect(slots.length, `${carrier} 有 ${slots.length} 层, 超过 20`)
        .toBeLessThanOrEqual(20)
      expect([...slots].sort((a, b) => a - b), `${carrier} 的层号不是 1 起的连续整数`)
        .toEqual(Array.from({ length: slots.length }, (_, i) => i + 1))
    }
  })

  it('已绑定的 Lot 与 CST 一一对应', () => {
    // 未绑定 CST 的 LOT 不参与这一条 —— 它本来就没有 CST。
    const lotToCst = new Map<string, string>()
    const cstToLot = new Map<string, string>()
    for (const r of strRows) {
      const cst = r['CST ID']
      if (!cst) continue
      const lot = r['Lot ID']
      const prevCst = lotToCst.get(lot)
      if (prevCst === undefined) lotToCst.set(lot, cst)
      else expect(prevCst, `Lot ${lot} 同时挂在 ${prevCst} 和 ${cst} 上`).toBe(cst)

      const prevLot = cstToLot.get(cst)
      if (prevLot === undefined) cstToLot.set(cst, lot)
      else expect(prevLot, `CST ${cst} 同时挂了 ${prevLot} 和 ${lot}`).toBe(lot)
    }
    expect(lotToCst.size).toBe(cstToLot.size)
  })

  it('一个载体只对应一个 P/N 与一道工序', () => {
    // P/N 是 Lot/CST 的父级; 工程是该 LOT/CST 当前的工序。
    // 两者在同一载体上出现两个值, 就说明数据把不同时间的快照混在了一起。
    const byCarrier = new Map<string, { pns: Set<string>; engs: Set<string> }>()
    for (const r of strRows) {
      const carrier = r['CST ID'] || r['Lot ID']
      let bucket = byCarrier.get(carrier)
      if (!bucket) {
        bucket = { pns: new Set(), engs: new Set() }
        byCarrier.set(carrier, bucket)
      }
      bucket.pns.add(r['P/N'])
      bucket.engs.add(r['工程名'])
    }
    for (const [carrier, s] of byCarrier) {
      expect([...s.pns].length, `${carrier} 同时服务 P/N: ${[...s.pns].join(' / ')}`).toBe(1)
      expect([...s.engs].length, `${carrier} 同时处于工序: ${[...s.engs].join(' / ')}`).toBe(1)
    }
  })

  it('空 CST 在透视表里按 Lot ID 归组 (回填生效)', () => {
    // pivot.ts 的预处理: CST ID 为空时用 Lot ID 回填。这条是它的端到端验证 ——
    // 单测里造的是两三行, 这里是整表。
    const unbondedLots = fixture.groups.filter((g) => !g.bonded).map((g) => g.lot)
    expect(unbondedLots.length).toBeGreaterThan(0)
    const cstCells = new Set(pivot.rows.map((r) => String(r['CST ID'] ?? '')))
    for (const lot of unbondedLots) {
      expect(cstCells.has(lot), `${lot} 没出现在透视表的 CST 列, 回填可能没生效`)
        .toBe(true)
    }
  })

  it('夹具里每组声明的 CST / Lot / P/N / 型号 / 工程都与源数据一致', () => {
    for (const g of fixture.groups) {
      // bonded 与实际 CST 空/非空必须一致; 未绑定只允许出现在 Jig Loading
      if (g.bonded) {
        expect(g.cst, `${g.name} 已绑定却没有 CST 编号`).not.toBe('')
      } else {
        expect(g.cst, `${g.name} 未绑定却给了 CST 编号`).toBe('')
        expect(g.engineering, `${g.name} 未绑定 CST, 却不在 Jig Loading`).toBe('Jig Loading')
      }

      for (const id of g.jigIds) {
        const row = rowById.get(id)
        expect(row, `${g.name}: ${id} 不在源数据里`).toBeDefined()
        expect(row!['CST ID'], `${id} 的 CST`).toBe(g.bonded ? g.cst : '')
        expect(row!['Lot ID'], `${id} 的 Lot`).toBe(g.lot)
        expect(row!['P/N'], `${id} 的 P/N`).toBe(g.pn)
        expect(row!['工程名'], `${id} 的工序`).toBe(g.engineering)
        expect(row!['Jig 对应型号'].split(/\s+/)[0], `${id} 的型号`).toBe(g.model)
      }
    }
  })

  it('分组行数合计与夹具声明一致, 每组就是一个 CST 的若干层', () => {
    const total = fixture.groups.reduce((s, g) => s + g.rows, 0)
    expect(total).toBe(fixture.rowCount)
    for (const g of fixture.groups) {
      expect(g.rows, `${g.name} 的层数超出 1–20`).toBeLessThanOrEqual(20)
      expect(g.rows, `${g.name} 的层数为 0`).toBeGreaterThan(0)
      expect(g.jigIds.length, `${g.name} 声明 ${g.rows} 行但给了 ${g.jigIds.length} 个 ID`)
        .toBe(g.rows)
    }
  })
})
