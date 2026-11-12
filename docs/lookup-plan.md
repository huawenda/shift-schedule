# 速查页开发文档

> **位置**：侧栏「业务」组，`JIG 数据` **下方**（第四个一级页面，按用户确认）
> **路由**：`#/lookup`；可选深链 `#/lookup/model/FY`、`#/lookup/jig/7748G`、`#/lookup/jig/31(10)`（`%2810%29` 等价）
> **数据**：构建期生成的静态数据，运行时不读文件、不依赖 Tauri
> **范围**：桌面壳（Tauri，窗口 ≥ 1024）；**本分支不做移动端与小屏**，`miniapp-uni/` 与窄屏适配都不在范围内；web 静态版不单独做窄屏布局
> **状态**：已实现（2026-11-10），**已被 2026-11-12 的重构取代**。
> **⚠️ 以谁为准**：速查页现在采用「预设展示页 + 统一 command + 实体关联结果」，
> 设计见 [lookup-refactor-plan.md](lookup-refactor-plan.md)；本文保留为 v1 三向查询的开发记录。
> 文内 §4 的 Esc 清空、8 条超出提示、FSPM 表列、行点击、展开按钮等细节与当时的实现已有出入。

---

## 1. 页面回答什么

速查页是一个只读的三向查询台，只回答三类问题：

| # | 已知 | 要得到的答案 | 对应区块 |
|---|---|---|---|
| A | GLS model | 该型号的 Main / Sub FSPM（组内可互换）、JIG P/N、Recipe、Bezel | 条件卡 + 双 FSPM 卡 |
| B | 一个 GLS model | 同 INCH 的其它型号，换型时 JIG 生产条件变不变：Recipe 变不变、Main/Sub FSPM 变一种还是两种 | 同 INCH 对比 |
| C | JIG P/N 或 Recipe | 能做哪些 GLS model、每个组合对应哪组 FSPM | 组合卡列表 |

页面上不做的事：编辑数据、导入 Excel、导出、写备份。数据是随应用发布的快照。

---

## 2. 数据口径（必须先对齐）

1. **组合（LookupGroup）**：原表 Sheet2/Sheet3 的一对 `Main + Sub`。同一组合共享一个 JIG P/N、一个 Recipe、一个 INCH 组合。
2. **组内型号完全等同**：一个组合里出现的所有 GLS model（Main 行 + Sub 行的并集）在生产上可互换，没有主次。例：`7748G` 的 `CP / FS / FZ / FT / CU / FY` 六个型号完全等同。
3. **通用项**：同一组合、同一位置（Main 或 Sub）下的全部 FSPM 互为通用项，可互换、无优先级。UI 只展示集合与数量，不选“默认项”。
4. **Main / Sub 只区分尺寸位置**：Main 对应 INCH 的前一个尺寸，Sub 对应后一个尺寸；它不是型号属性。
5. **Recipe 与 JIG P/N 一一对应**：当前数据 24 个 JIG P/N、24 个 Recipe，无一对多。搜 Recipe 等价于搜 JIG P/N。
6. **归档不进速查**：
   - `7742D` 的 `CR` 组合（型号疑为误写，且与 `7M` 组合内容完全相同）已归档；
   - `7742C` 的 `CR/RD` 保留，所以搜 `CR` 仍能命中 `7742C`。
7. **已修正的数据**（来自属性表验收）：
   - `P481` = Pro-N、`P482` = Stal-N（原 M/N 两列填反）；
   - `P429` = Stal-N（原 K/M 两处）；
   - 尺寸 `31.5` 统一记 `31`（description 原文保留）；
   - 矩阵未引用的 25 个 FSPM 不进入速查。

数据规模（当前快照）：

| 项 | 数量 |
|---|---|
| 组合 | 48 |
| GLS 型号 | 110 |
| 型号 × 尺寸记录 | 220 |
| FSPM | 92 |
| 组合 × FSPM 关系 | 284 |
| INCH 组合 | 83/48、77/48、77/42、77/27、65/55、39/31 |

---

## 3. 数据结构

### 3.1 运行时类型

```ts
// src/features/lookup/core/types.ts
export type Bezel = 'Normal' | 'Narrow' | 'V-Narrow'
export type Material = 'Stal' | 'Pro' | 'Stal-N' | 'Pro-N'
export type Maker = 'LGC' | 'INNOX'
export type Part = 'main' | 'sub'
export type LookupMode = 'model' | 'jig'

export interface Fspm {
  /** 材料型号，如 P342 */
  id: string
  /** 属性表里的尺寸，如 83 / 31 */
  size: string
  maker: Maker
  material: Material
  bezel: Bezel
}

export interface LookupGroup {
  /** 稳定 ID，如 7748G-01 */
  id: string
  /** 英寸组合，如 77/48 */
  inch: string
  jigPn: string
  recipe: string
  mainSize: string
  subSize: string
  mainBezel: Bezel
  subBezel: Bezel
  /** 组内等同的 GLS 型号 */
  models: string[]
  /** 通用项：可互换，无顺序语义 */
  mainFspm: string[]
  subFspm: string[]
  /** 溯源，如 "Sheet2 行37-38" */
  source: string
}
```

示例（也是测试基准）：

```ts
{
  id: '7748G-01',
  inch: '77/48',
  jigPn: '7748G',
  recipe: '31(10)',
  mainSize: '77',
  subSize: '48',
  mainBezel: 'Narrow',
  subBezel: 'Normal',
  models: ['CP', 'FS', 'FZ', 'FT', 'CU', 'FY'],
  mainFspm: ['P467', 'P388', 'P408', 'P429'],
  subFspm: ['P486', 'P483', 'P485', 'P481', 'P482'],
  source: 'Sheet2 行37-38',
}
```

### 3.2 索引

页面加载时一次性构建，之后所有查询都走 `Map`：

```ts
// src/features/lookup/core/indexes.ts
export interface LookupIndex {
  groups: LookupGroup[]
  fspm: Map<string, Fspm>
  /** 型号 → 唯一组合（生成时断言唯一） */
  byModel: Map<string, LookupGroup>
  /** JIG P/N → 该生产条件下的全部组合 */
  byJig: Map<string, LookupGroup[]>
  /** Recipe → 同上（当前与 byJig 等价，但保留独立索引） */
  byRecipe: Map<string, LookupGroup[]>
  /** INCH → 同尺寸组合，用于换型对比 */
  byInch: Map<string, LookupGroup[]>
}

export function buildLookupIndex(
  groups: LookupGroup[],
  fspmTable: Record<string, Fspm>
): LookupIndex
```

规则：

- 型号键统一 `normalize()`：NFKC + 去空白 + 大写。`fy`、`FY`、`ＦＹ` 命中同一个。
- Recipe 键同样 normalize，全角括号 `（10）` 经 NFKC 归一成 `(10)`。
- `byJig` / `byRecipe` 的值按 `id` 升序；`byInch` 按 `jigPn` 再按 `id` 升序，保证对比表顺序稳定。
- 一个型号只允许属于一个组合；生成脚本断言，重复直接失败（当前 `CR` 已归档，不重复）。

### 3.3 同 INCH 对比算法

对比的是**当前组合**与**同 INCH 的其它组合**，不是型号名。原因：同组内型号完全等同，换型号不变；跨组才可能变。

```ts
// src/features/lookup/core/diff.ts
export type ChangeLevel = 'same' | 'partial' | 'all'

export interface SetChange {
  level: ChangeLevel
  /** 目标有、当前没有 */
  added: string[]
  /** 当前有、目标没有 */
  removed: string[]
}

export interface GroupDiff {
  jigChanged: boolean
  recipeChanged: boolean
  main: SetChange
  sub: SetChange
}

export function diffSets(current: string[], target: string[]): SetChange
export function compareGroups(current: LookupGroup, target: LookupGroup): GroupDiff
export function describeChange(current: LookupGroup, target: LookupGroup): string[]
```

`ChangeLevel` 判定：

- `same`：`added` 与 `removed` 都为空；
- `partial`：两个集合有交集，但有增删；
- `all`：两个集合无交集。

文案（UI 与测试共用同一份）：

```
当前组合：当前型号
JIG/Recipe 都没变：JIG / Recipe 不变
JIG 或 Recipe 变：P/N 8348B → 8348C，Recipe 8 → 2
Main：Main 不变 / Main 全换 / Main 部分换（移除 P405；无新增）
Sub：Sub 不变 / Sub 全换 / Sub 部分换（移除 P414、P434；无新增）
```

「不变 / 全换」只给结论，「部分换」才在括号里列增删。

“变一种还是两种”由后两段直接回答：

- 只有Main变 → 换Main；
- 只有Sub变 → 换Sub；
- 两段都变 → Main、Sub 各一枚徽标，各自标明全换 / 部分换；两段都全换时合并为 `Main/Sub 全换`；
- 两段都不变、但 JIG/Recipe 变 → 只换 JIG 生产条件，FSPM 不动；
- 全都不变 → `Recipe 同` + `Main 不变` + `Sub 不变`。

关键例子（必须写进测试）：

| 对比 | JIG / Recipe | Main | Sub |
|---|---|---|---|
| `8348B-01` ER → `8348B-02` ES | 不变 | 部分换（少 P405） | 部分换（少 P414、P434） |
| `8348B-01` ER → `8348C-01` EV | 8348B→8348C，8→2 | 全换 | 部分换（少 P414、P434） |
| `7748B-01` KG/7D → `7748B-02` 7X/FJ | 不变 | 全换 | 全换 |
| `7748G-01` 同组内换型号 | 不变 | 不变 | 不变 |

### 3.4 数据生成

**不在运行时读 Excel**：速查页必须离线、零文件依赖，web 静态版也要能用。
数据由脚本从两份已验收的表生成，结果提交进仓库。

```
docs/JIG-FSPM-属性表.xlsx  ─┐
                            ├─ scripts/build-lookup-data.mjs ─→ src/features/lookup/data/lookupData.ts
docs/JIG-查询表.xlsx       ─┘
```

生成脚本读取：

| 来源 sheet | 取什么 |
|---|---|
| `JIG-FSPM-属性表.xlsx` / `属性表` | `id → { size, maker, material, bezel }` |
| `JIG-查询表.xlsx` / `JIG 组合` | `id, inch, jigPn, recipe, mainSize, subSize, mainBezel, subBezel, models, source` |
| `JIG-查询表.xlsx` / `组合-FSPM 明细` | `组合ID + 主/副 + FSPM 型号`，组装成 `mainFspm` / `subFspm` |

现有三张表已经覆盖三个场景，不需要再加列或改表；速查页只是把它们重排成运行时结构：

| 场景 | 数据来源 |
|---|---|
| A 型号 → 主/副 FSPM + 条件 | `型号索引`（型号 × 尺寸，220 行） |
| B 同 INCH 换型对比 | `型号索引` 按 `英寸组合` 筛选，或 `JIG 组合` 按 INCH 取组 |
| C JIG / Recipe → 型号 | `JIG 组合`（48 组），一个 JIG 可能对应多组 |
| FSPM 属性 | `JIG-FSPM-属性表`（92 个） |

输出：

```ts
// src/features/lookup/data/lookupData.ts
// AUTO-GENERATED by scripts/build-lookup-data.mjs — 不要手改
export const LOOKUP_DATA_VERSION = '2026-11-12'
export const LOOKUP_GROUPS: readonly LookupGroup[] = [/* 48 组 */]
export const FSPM_TABLE: Readonly<Record<string, Fspm>> = {/* 92 个 */}
```

命令：

```bash
pnpm lookup:data    # 重新生成
pnpm lookup:check   # 只校验生成物是否与源表一致，不写文件
```

`lookup:data` **不挂进 `pnpm build`**：构建时不该依赖 docs 下的 xlsx，生成物已提交。
属性表或查询表变更后手动重跑，并在提交里带上生成文件；提交前用 `lookup:check` 自查。

### 3.5 生成时校验（失败即中止）

- 48 个组合；每个组合 `mainFspm`、`subFspm` 都非空；
- 110 个型号，型号全局唯一，且都能反查回一个组合；
- 每个 FSPM id 都能在属性表找到，四个属性都非空；
- 每个 FSPM 的 `size` 等于它所在位置的尺寸（Main / Sub）；
- 每个组合的 `mainSize` / `subSize` 等于 `inch.split('/')`；
- Recipe 与 JIG P/N 一一对应；
- `CR` 必须落在 `7742D-03`；`7742C` 的型号是 `CQ/RD`。

---

## 4. 交互设计

### 4.1 总流程

采用查询类工具最常用的 **“搜索 → 结果 → 对比”** 单列结构，不用左侧列表 + 右侧详情：

- 速查只有一个查询对象，左侧列表没有额外价值；
- 单列可以只保留一层滚动（`.canvas-flow`），符合本项目的滚动约定；
- 同 INCH 对比表本身就需要整行宽度。

```
输入 → 选择建议项 → 写 hash → 结果区渲染
```

### 4.2 搜索框（核心交互）

**结构**：模式页签 + 输入框 + 建议浮层。

```
┌ 按 GLS 型号 │ 按 JIG / Recipe ┐
[ 🔍 输入 GLS 型号，如 FY / 7X                    ✕ ]
```

- 模式用 shadcn `Tabs`，两个值：`model` / `jig`；
- 输入用 shadcn `Input`，左侧 `Search` 图标，右侧清空 `X`；
- 建议浮层用 `Popover` 锚在输入框下方，内部是自建 `role="listbox"`（项目未装 `cmdk`，不为此加依赖）；
- 输入即过滤，不做防抖（110 条，量级可忽略）。

**匹配规则**（`model` 模式）：

1. 完全相等；
2. 前缀匹配；
3. 子串匹配；
4. 按组内顺序稳定排序，最多展示 8 条，超出提示“还有 N 条，继续输入”。

`jig` 模式同时在 `byJig` 与 `byRecipe` 里查，结果合并去重；建议项主文本是 JIG P/N，副文本是 `Recipe · 英寸 · N 个型号`。

**键盘**（combobox 标准行为）：

| 键 | 行为 |
|---|---|
| ↑ / ↓ | 移动高亮项，循环 |
| Enter | 选中高亮项；没有高亮但有完全匹配时选中完全匹配 |
| Esc | 关闭建议；已关闭时清空输入 |
| Tab | 关闭建议并离开 |

输入框需带 `role="combobox"`、`aria-expanded`、`aria-controls`、`aria-activedescendant`；建议项 `role="option"`、`aria-selected`。高亮用 `--accent-weak` 底 + `--accent` 左竖条（强调色只做“你在这里”，不承载数据）。

**选中后**：

- 输入框保留选中项文本；
- 建议关闭；
- 结果区顶部对齐，不保留上一次滚动位置；
- 写入 hash（`replaceState`，与全站导航一致，不压历史）。

**深链进入**：从 hash 拿到 selection 后，输入框预填、结果直接渲染；找不到 key 时显示“没找到「xxx」”的空态，不弹 toast。

### 4.3 型号结果（场景 A + B）

从上到下四块：

1. **条件卡**：型号名 + 组内等同提示 + 五个字段（英寸组合 / JIG P/N / Recipe / 主尺寸·Bezel / 副尺寸·Bezel）。
2. **双 FSPM 卡**：左“主尺寸 77 · Narrow”，右“副尺寸 48 · Normal”；每张卡标题右侧是“可互换 N 项”。卡内是 **3 列迷你表**：`型号 / 厂家 / 材质`（Bezel 已在卡片标题里，不再重复占列）。
3. **同 INCH 对比**：一行一张圆角卡片，列出 `byInch.get(inch)` 的全部组合；当前组用左侧装饰条 + 浅青底标记。
4. **数据脚注**：`数据快照 2026-11-12 · 48 组 / 110 型号`。

**信息优先级**（按现场使用频率）：

| 优先级 | 信息 | 呈现方式 |
|---|---|---|
| 1 | P 号 | 迷你表第一列，12px/600 |
| 2 | 厂家 | 独立列，正常字号 |
| 3 | Bezel | 独立列，正常字号 |
| 4 | 尺寸 | 卡头已有（主尺寸 77 / 副尺寸 48），不再重复 |
| 5 | 材质 | 型号后面的 11px `--faint` 小字，可忽略；展开/对比里也不做独立列 |

**FSPM 迷你表长这样**：

```
主尺寸 77 · Narrow                              可互换 4 项
┌──────────────┬────────┬─────────┐
│ 型号          │ 厂家    │ Bezel    │
│ P467  Pro     │ INNOX  │ Narrow  │
│ P388  Stal    │ INNOX  │ Narrow  │
│ P408  Pro     │ INNOX  │ Narrow  │
│ P429  Stal-N  │ INNOX  │ Narrow  │
└──────────────┴────────┴─────────┘
```

- 材质跟随型号，写成 `P467 Pro`（Pro 为 11px `--faint`），不单独成列；
- Bezel 来自属性表，与卡头的行 Bezel 可能不同（例如 Normal 的 JIG 被 V-Narrow 行引用）；两者都展示，不互相覆盖；
- 行高 28，字号 12；不按材质配色。

**对比表列**：

| 列 | 内容 |
|---|---|
| 型号组 | 组内型号，用 ` / ` 连接；当前组带“当前”标记 |
| JIG · Recipe | `8348B · 8`；变化时加粗 |
| Bezel（主/副） | `Normal / Normal`，变化不影响换料判断，但保持可见 |
| 主尺寸 FSPM | 紧凑列表，每项 `P342 LGC`；可互换项全部列出 |
| 副尺寸 FSPM | 同上 |
| 变化 | 2–3 枚变化标签 + 一个“展开明细”按钮 |

对比表只承担“哪些 P 号变了”，所以 FSPM 项只写 `P号 + 厂家`；材质不占列，需要时在展开行或上方迷你表里看。

**变化标签**：

- `Recipe 同` / `Recipe 变`（`--warning-bg`）；
- `Main 不变` / `Main 部分换` / `Main 全换`；
- `Sub 不变` / `Sub 部分换` / `Sub 全换`；
- Main 与 Sub 都全换时合并为 `Main/Sub 全换`。

默认三枚（Recipe + Main + Sub），每枚都带明确等级，不再用「条件不变」把三项糊成一枚。不要用红绿区分增删——项目没有“增/减”语义色；用 `+` / `−` 符号与文字。

**展开明细**：每行右侧一个 ghost 图标按钮（`ChevronDown`），展开后先给该组合的两张 FSPM 迷你表，最后一行是变化摘要注脚。迷你表在展开区里**不再套第三层卡片**：去掉边框、圆角和底色，用标题行与栏间发丝线分组。摘要里「不变 / 全换」只给结论，「部分换」才列增删：

```
Main 83 · Normal                  Sub 48 · Normal
P342 INNOX Narrow                 P403 INNOX Narrow
P436 INNOX Narrow                 P435 INNOX Narrow
──────────────────────────────────────────────────
8348B → 8348C，8 → 2；Main 全换，Sub 部分换（移除 P414、P434；无新增）
```

展开不改变选中项，可同时展开多行；再点收起。没有增删的行不显示按钮。

**行点击**：不整行可点。避免“点一下就把当前型号换掉”的误操作；要看别的组合，用搜索框。

### 4.4 JIG / Recipe 结果（场景 C）

从上到下：

1. **条件卡**：JIG P/N 大字 + Recipe + 涉及的 INCH 组合 + `N 个组合 / M 个型号`。
2. **组合卡列表**：一个组合一张卡，按组合 ID 升序；每张卡包含：
   - 卡头：组合 ID、英寸组合、主/副尺寸与 Bezel；
   - 型号行：组内型号 chips（型号本身没有更多属性，用 chip 即可）；
   - FSPM 两列：主尺寸 / 副尺寸，各带“可互换 N 项”，用与 4.3 相同的 3 列迷你表（型号 / 厂家 / Bezel，材质弱化）。
3. 如果同一个 JIG 有多个组合（如 `7748B` 有 3 个），卡列表直接体现“同一生产条件下不同型号组用不同 FSPM”，这正是场景 C 要回答的。

### 4.5 空态与无结果

**未选择时**（默认落地）：

```
速查
GLS 型号 · JIG P/N · Recipe 三向互查

┌──────────────────────────────────────────────┐
│ 输入 GLS 型号，查它可用的 Main / Sub FSPM      │
│ 输入 JIG P/N 或 Recipe，反查能做哪些型号       │
│                                              │
│ 试试：[ FY ]  [ 7748G ]  [ 31(10) ]           │
└──────────────────────────────────────────────┘
数据快照 2026-11-12 · 48 组 / 110 型号 / 92 个 FSPM
```

示例 chip 点击后等价于：切到对应模式、填入 key、选中。

**无匹配**：建议浮层显示“没有匹配的型号 / JIG / Recipe”，Enter 不动作。
**深链失效**：结果区显示“没找到「xxx」”，下面是示例 chip。

### 4.6 URL 与状态

- 选择状态进 hash，刷新/分享可复现；
- 输入框内容不进 hash（避免每敲一个字改地址）；
- 模式切换时清空输入与选择，placeholder 跟着模式变；
- 清空按钮：清空输入、清空选择、回到空态；
- 页面状态只放组件内，不进 `localStorage`、不进备份。

---

## 5. UI 设计

### 5.1 组件映射（优先 shadcn）

| 区域 | 方案 | 来源 |
|---|---|---|
| 模式切换 | `Tabs` / `TabsList` / `TabsTrigger` | `@/components/ui/tabs` |
| 搜索输入 | `Input` | `@/components/ui/input` |
| 建议浮层 | `Popover` + 自建 listbox | `@/components/ui/popover` |
| 条件卡 / 组合卡 | `.card-surface` | `src/styles/tokens.scss` |
| GLS 型号 chip | `LookupChip`（自建） | 新增 |
| FSPM 明细 | `FspmTable`（自建，3 列迷你表） | 新增 |
| 对比表 | `Table` 系列 | `@/components/ui/table` |
| 变化标签 | `ChangeBadges`（自建） | 新增 |
| 展开按钮 / 清空 | `Button`（ghost / icon-sm） | `@/components/ui/button` |
| 区块分隔 | `Separator` | `@/components/ui/separator` |
| 长文本提示 | `Tooltip` | `@/components/ui/tooltip` |
| 图标 | `lucide-react`：`Search`、`X`、`ChevronDown`、`CornerDownLeft` | 已有依赖 |

不引入 `cmdk`、`Badge`、`Card` 新依赖：`Badge`/`Card` 用项目已有的 `.card-surface` 与自建 chip / 迷你表解决，保持包体与 `file://` 离线约束。

### 5.2 自建组件

**`LookupChip`**：GLS 型号 chip（组合卡的型号行用）。

- `<span class="lookup-chip">CP</span>`；
- 12px/600、`--text`，底 `--surface-sunken`、1px `--border`、圆角 `--radius-sub`；
- 型号本身没有更多属性，不加 Tooltip。

**`FspmTable`**：FSPM 3 列迷你表，型号结果、JIG 结果、对比展开行三处共用。

```
┌──────────────┬────────┬─────────┐
│ 型号          │ 厂家    │ Bezel    │
│ P467  Pro     │ INNOX  │ Narrow  │
└──────────────┴────────┴─────────┘
```

- 第一列是 `P号 + 材质小字`：P 号 12px/600 `--text`，材质 11px `--faint`，不单独成列；
- 厂家 / Bezel 默认可见，不做“悬停才出现”；
- 尺寸不重复：卡头已经写了主/副尺寸；
- 行高 28，字号 12，数字列 `tabular-nums`；
- 数据异常时（尺寸缺失、FSPM 不在属性表）整行标 `--warning-ink`，正常不标；
- 表头只在卡片第一张出现时显示，避免两卡重复；JIG 结果里每张卡各自带表头。

**`ChangeBadges`**：变化标签组。

- 中性（`Recipe 同` / `Main 不变` / `Sub 不变`）：`--surface-sunken` 底 + `--muted` 字；
- 变化（`Recipe 变` / `× 部分换` / `× 全换`）：`--warning-bg` / `--warning-ink`，圆角 `--radius-pill`，11px；
- 文案来自 `changeBadges` / `describeChange`，不在组件里拼业务句子。

**`SuggestionList`**：建议浮层内容。

- 宽度跟随输入框；
- 每项两行：主文本 13px，副文本 11px `--faint`；
- 高亮命中子串：`<mark>` + `--accent-weak` 底，不加粗；
- 最多 8 项，列表自身不滚（超出靠继续输入）。

### 5.3 令牌

只使用现有令牌，不新增颜色：

| 用途 | 令牌 |
|---|---|
| 画布 / 卡片底 | `--surface`、`.card-surface` |
| 内嵌底 / 芯片底 | `--surface-tint`、`--surface-sunken` |
| 结构线 / 分隔线 / 发丝线 | `--border-strong`、`--border`、`--rule` |
| 正文 / 辅助 / 最弱 | `--text`、`--muted`、`--faint` |
| 当前项 / 命中 | `--accent`、`--accent-weak`、`--accent-soft` |
| 变化提示 | `--warning-bg`、`--warning-ink` |
| 间距 | `--sp-1`（4）、`--sp-2`（8）、`--sp-3`（12）、`--sp-4`（16）、`--sp-5`（24） |
| 字号 | `--fs-label`（11）、`--fs-small`（12）、`--fs-control`（13）、`--fs-body`（14）、`--fs-subhead`（16）、`--fs-title`（26） |
| 圆角 | `--radius-sub`（4）、`--radius-control`（6）、`--radius-lg`（10）、`--radius-pill`（999） |

硬规则：

- 不写 hex / rgba；
- 卡片 1px 细边、无投影；
- 不新增第二套按钮 / 输入框样式，直接用 shadcn 组件与 `--ui-*`；
- 表格不画竖线、不用斑马纹，行分隔只用 `--rule`。

### 5.4 表格规范

- 表头：12px / 600 / `--muted`，左对齐，`letter-spacing: 0.02em`；
- 单元格：13px / 400 / `--text`，行高 36；
- 数字（Recipe、数量）加 `font-variant-numeric: tabular-nums`；
- 列宽（1228 版心）：型号组 170、P/N · Recipe 150、Bezel 100、Main 270、Sub 270、变化 180；总宽 1140，卡片内容宽 1148，留 8px 余量避免 2px 溢出触发横滚；
- 当前行：`--accent-weak` 底 + 2px `--accent` 左竖条，不用整行加粗；
- 变化列里的“变”用 `--warning-ink` 文字，不用红底。

### 5.5 暗色与无障碍

- 全部走令牌，暗色自动跟随；`--warning-bg` 在暗色下已有对应值（`tokens.scss` 深色段），不另写；
- 对比不只靠颜色：标签带文字，增删带 `+` / `−`；
- 焦点环用 `--accent`，输入框、建议项、展开按钮都要有 `focus-visible`；
- 建议列表行高 36、对比表行高 36、FSPM 迷你表行高 28；
- `prefers-reduced-motion` 下不加过渡。

---

## 6. 布局方案

### 6.1 线框（桌面 ≥ 1024，内容区 1228 上限）

```
┌──────────┬─────────────────────────────────────────────────────────────┐
│ 昼夜     │ 顶栏：折叠 / 数据快照 2026-11-10         导出 导入  ☾        │ 56
│          ├─────────────────────────────────────────────────────────────┤
│ 排班     │ 速查                             GLS 型号 · JIG · Recipe     │ 页头 26px
│ 全员矩阵 │                                                             │
│ 月度概览 │ ┌ 按 GLS 型号 │ 按 JIG / Recipe ┐                            │
│          │ │ [🔍 输入型号，如 FY / 7X         ✕]   支持部分匹配          │ 40
│ 业务     │ └──────────────────────────────────────────────────────────┘
│ JIG 数据 │                                                             │
│ 速查  ◀  │ ┌ 条件卡 ──────────────────────────────────────────────────┐ │
│          │ │ FY   7748G · Recipe 31(10) · 77/48   同组 6 个型号等同   │ │ 72
│          │ └──────────────────────────────────────────────────────────┘ │
│          │ ┌ 主尺寸 77 · Narrow · 可互换 4 项 ──┐ ┌ 副尺寸 48 · Normal · 可互换 5 项 ─┐
│          │ │ 型号      厂家     材质             │ │ 型号      厂家     材质            │
│          │ │ P467     INNOX    Pro              │ │ P486     LGC      Stal           │
│          │ │ P388     INNOX    Stal             │ │ P483     LGC      Pro            │
│          │ └─────────────────────────────────────┘ └────────────────────────────────────┘
│          │ ┌ 同 INCH 型号对比 · 77/48（12 组）──────────────────────────────────┐ │
│          │ │ 型号组 | P/N·Recipe | Bezel | Main | Sub | 变化                      │ │
│          │ │ CP/FS/FZ/... | 7748G·31(10) | N/N | ... | ... | 当前                 │ │
│          │ │ KG/7D | 7748B·7 | N/N | ... | ... | Recipe 同 Main 不变 Sub 不变    │ │
│          │ └────────────────────────────────────────────────────────────────────┘ │
│ 设置     │                                                             │
└──────────┴─────────────────────────────────────────────────────────────┘
```

### 6.2 尺寸

- 设计基准 **1466 × 900**（壳默认），版心 `max-width: 1228`、`margin: 0 auto`、`padding: var(--pad)`；
- 页头固定，内容进 `.canvas-flow` 滚动（与其余页面一致）；
- 页头下方区块间距 `--sp-4`（16）；
- 搜索行：页签高 36、输入框高 36，同一行；输入框 `max-width: 640`；
- 条件卡：内边距 `--sp-4`，字段用两列 `label + value` 网格；
- 双 FSPM 卡：固定两列 `repeat(2, minmax(0, 1fr))`，间距 `--sp-4`；卡内 3 列迷你表；
- 对比表：固定 6 列，总宽 1140（见 5.4），不换列；
- 组合卡列表：单列，卡间距 `--sp-3`。

### 6.3 最小窗口（1024）

本分支只做桌面壳，不做移动端与小屏重排，也不加容器查询。壳最小窗口 1024 时内容区约 720：

- 双 FSPM 卡仍两列（各约 344，3 列迷你表放得下）；
- 对比表保持 6 列，外层 `overflow-x: auto`，表格 `min-width: 1080`，只在表格内部横向滚动；
- 页面本身不横向滚动；
- 不提供卡片替代视图、不折叠列、不改字号。

### 6.4 滚动

- 只有 `.canvas-flow` 一层纵向滚动；
- 对比表在 1024 窗口下允许自身横向滚动，这是唯一例外；
- 不分页、不虚拟滚动（48 组上限，量级很小）；
- 表格不做 sticky 表头（同页只有一张表，且页头已固定）。

---

## 7. 改动清单

### 7.1 新增

```
src/features/lookup/
  core/
    types.ts            类型
    indexes.ts          buildLookupIndex / 查询函数
    diff.ts             diffSets / compareGroups / describeChange
    normalize.ts        NFKC + 大写 + 去空白
    instance.ts         用生成数据建一次索引
  data/
    lookupData.ts       生成产物
  components/
    LookupScreen.tsx    页面容器
    LookupSearch.tsx    模式页签 + 输入 + 建议（listbox 内联，不单独拆文件）
    LookupEmpty.tsx     空态 + 示例
    ModelResult.tsx     条件卡 + 双 FSPM 卡
    JigResult.tsx       条件卡 + 组合卡列表
    GroupCard.tsx       组合卡（JIG 结果）
    FspmTable.tsx       FSPM 3 列迷你表（型号 / 厂家 / Bezel）
    LookupChip.tsx      GLS 型号 chip
    LookupFootnote.tsx  数据快照脚注
    ChangeBadges.tsx    变化标签
    CompareTable.tsx    同 INCH 表格
  styles/
    lookup.scss         页面样式
  __tests__/
    indexes.test.ts
    diff.test.ts
    data.test.ts
scripts/build-lookup-data.mjs
```

### 7.2 修改

| 文件 | 改动 |
|---|---|
| `src/appLocation.ts` | `Route` 加 `lookup`；`ROUTE_TITLE.lookup = '速查'`；解析/生成 `#/lookup[/mode/key]` |
| `src/App.tsx` | 增加 lookup 分支；把 `lookup` 选择状态交给 hash；`scrollPositions` 增加 lookup |
| `src/components/AppSidebar.tsx` | 「业务」组在 web 也显示；组内顺序 `JIG 数据 → 速查`；折叠分隔线条件改为“业务组是否存在” |
| `src/components/AppShell.tsx` | lookup 路由复用 `TopBar`，隐藏月份导航；不挂 `JigStatusRail` |
| `src/components/TopBar.tsx` | 新增 `showPeriodNav?: boolean`（默认 true）与 `label?: string`；速查页传 `false` + `数据快照 2026-11-10`，用 label 占住月份胶囊的位置 |
| `src/styles.scss` | `@use './features/lookup/styles/lookup'` |
| `package.json` | 增加 `"lookup:data": "node scripts/build-lookup-data.mjs"` |

### 7.3 路由细节

```
#/lookup                         空态
#/lookup/model/FY                型号结果
#/lookup/jig/7748G               JIG 结果
#/lookup/jig/31(10)              Recipe 结果（括号可直接出现，%2810%29 也认）
```

- `AppLocation` 增加 `lookup: { mode: LookupMode; key: string } | null`；
- `parseLocation`：`parts[0] === 'lookup'` 时，`parts[1]` 只能是 `model` / `jig`，`parts[2]` 用 `decodeURIComponent`，缺失或非法一律回空态；
- `buildHash`：`#/lookup` 或 `#/lookup/${mode}/${encodeURIComponent(key)}`；不写月份；
- `navigate` 支持传 `lookup`，不传则沿用当前值；
- 侧栏 `hrefs.lookup = '#/lookup'`。

### 7.4 侧栏细节

- `showJig = isTauriShell()`；`showLookup = true`（速查不依赖壳能力）；
- `showBusiness = showJig || showLookup`；
- 「业务」组：
  - 先 `JIG 数据`（仅壳里）；
  - 再 `速查`（始终）；
- 折叠态分隔线：`state === 'collapsed' && showBusiness` 时插入（现有逻辑从 `showJig` 改为 `showBusiness`）；
- 图标：`Search`；tooltip `速查`；
- `MobileNav` 不改：本分支不做移动端 / 小屏，底部标签栏保持现有 3 项；窄屏 web 不保证速查入口。

---

## 8. 测试与验收

### 8.1 单元测试

`data.test.ts`：

- `LOOKUP_GROUPS.length === 48`；
- 型号总数 110，且 `byModel.size === 110`；
- `byModel.get('FY')!.id === '7748G-01'`；
- `byModel.get('CR')!.id === '7742D-03'`；`byModel.get('CQ')!.id === '7742C-04'`；
- `byJig.get('7748B')` 有 3 组；
- `byRecipe.get('31(10)')` 与 `byJig.get('7748G')` 相同；
- 每个 FSPM 都在 `FSPM_TABLE` 里，属性非空；
- 每个组合的主/副 FSPM 尺寸与 `mainSize` / `subSize` 一致。

`diff.test.ts`：

- `diffSets` 的 same / partial / all 三种；
- `8348B-01 vs 8348B-02` → JIG 不变、Recipe 不变、Main partial（移除 P405）、Sub partial（移除 P414/P434）；
- `8348B-01 vs 8348C-01` → JIG 变、Recipe 变、Main all、Sub partial；
- `7748B-01 vs 7748B-02` → JIG/Recipe 不变、Main all、Sub all；
- 同组对比 → 全 same；
- `describeChange` 文案与上表一致。

`indexes.test.ts`：

- `normalize('ｆｙ') === 'FY'`；
- `normalize('31（10）') === '31(10)'`；
- `byInch.get('77/48')` 有 12 组，按 `jigPn` 升序；
- 未知 key 返回空，不抛错。

### 8.2 构建与验收

```bash
pnpm lookup:data
pnpm build
pnpm test -- --run
```

- 页面交互与视觉由用户实机验收（按项目约定，不主动截图）；
- 验收点：深链刷新、键盘上下/回车、暗色、示例 chip 可点、FSPM 迷你表里厂家与 Bezel 默认可见、材质弱化小字可见但不抢视线、1024 窗口下对比表只在自己容器内横向滚动。

---

## 9. 边界与后续

- **不做编辑**：速查只读；数据更新走“改 xlsx → 重跑 `pnpm lookup:data` → 提交”。
- **不做导出**：需要时再评估，避免和 JIG 页的导出链路混在一起。
- **FSPM → 型号反向索引**：当前数据可直接推（`FSPM_TABLE` + 组合关系），但本次不做；等实际查询场景提出再加。
- **型号重复**：生成脚本断言唯一；将来若出现重复（如两个 JIG 共用型号），需要把 `byModel` 改成 `Map<string, LookupGroup[]>` 并在结果区列出多个组合。
- **Recipe 一对多**：当前 24:24；若未来一个 Recipe 对应多个 JIG P/N，`byRecipe` 已按数组存，UI 结果区需要按 JIG 分组展示。
- **顶部月份导航**：速查与月份无关，复用 `TopBar` 时隐藏；若后续顶栏改造，保留 `showPeriodNav` 这个开关。
- **移动端**：本分支不做；`MobileNav` 保持 3 项，速查只在桌面侧栏出现。移动端分支若要接，优先复用 `LookupScreen` 与数据层，只重排卡片。
