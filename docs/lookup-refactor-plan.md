# 生产速查页重构方案（展示页 + 统一 command）

> **状态**：方案定稿；**P0–P4 已实施（2026-11-12）**，仅 README §2 / DESIGN §5 / v1 文档状态的同步待确认。P1 把双 Tab 换成统一 command，P2 把默认落地从空态换成「总览 + 四维度浏览板」，P3 补齐专属结果块与返回路径，P4 加类型前缀与快捷键。
> **前身**：`docs/lookup-plan.md` 是 v1 开发文档（2026-11-10 已实现），保留为历史记录，不覆写。
> **数据**：沿用现有构建期快照，**不改 xlsx、不改生成脚本、不改 `lookupData.ts`**；新增索引全部在运行时推导。
> **范围**：桌面壳（Tauri，窗口 ≥ 1024）与 Web 静态版；与 v1 一致，**不做移动端 / 窄屏适配**。
> **文档关系**：实现完成后再同步 `README.md` §2 功能表（目前仍缺生产速查）与 `DESIGN.md` §5 路由表；本文不代劳。

---

## 1. 为什么要改

### 1.1 v1 的隐含假设

现有页面有两个模式页签（「按 GLS 型号」/「按 JIG / Recipe」），用户必须**先知道自己要查的是哪一类键、并且手里已经有那个编号**，才能开始操作。落地是空态引导页加三个示例 chip。这套交互只服务「带着明确目的来核对一个编号」的场景，覆盖不了：

- 没有具体编号、只想先看看有哪些英寸组合 / 型号 / 夹具；
- 手上只有一个 FSPM 的 P 号，想反查哪些组合、哪些型号用了它；
- 已知一个元素，想顺着关联一路看到和它有关的全部项，而不是每次退回搜索框重输。

### 1.2 目标

把「查已知键」升级为「**浏览 + 探索关联**」：

1. 默认落地是**几个预设展示页**，无目的也能浏览；
2. 一个 **command** 输入任意元素，自动识别实体类型，不要求先选模式；
3. 选中实体后，结果页展示**和这个元素有关的所有项**；
4. 结果里的每个元素都能再点，形成漫游闭环。

### 1.3 非目标

编辑数据、导入 Excel、导出、写备份；引入新依赖（不装 cmdk）；全局 `⌘K`/`Ctrl+K` 浮层；移动端与窄屏；改数据快照或源表；FSPM 属性口径调整。

---

## 2. 现状盘点（2026-11-12 以代码为准）

### 2.1 现有实现

| 层 | 文件 | 现状 |
|---|---|---|
| 数据 | `data/lookupData.ts` | 生成物，`LOOKUP_GROUPS` / `FSPM_TABLE` / `LOOKUP_DATA_VERSION = '2026-11-12'` |
| 生成 | `scripts/build-lookup-data.mjs` | `pnpm lookup:data` / `pnpm lookup:check`；生成时硬断言 48 组 / 110 型号 / 92 FSPM |
| 索引 | `core/instance.ts`、`indexes.ts` | 模块加载时建一次索引；`byModel` / `byJig` / `byRecipe` / `byInch` / `fspm` 加 `jigs` 聚合入口 |
| 算法 | `core/diff.ts` | 集合对比、变化徽标、展开摘要 |
| 界面 | `components/`（11 个） | `LookupScreen` 编排；`LookupSearch` 双 Tab 搜索；`ModelResult` / `JigResult` / `LookupEmpty` 三种结果态 |
| 路由 | `appLocation.ts` | `AppLocation.lookup: LookupSelection \| null`，`{ mode, key }`；hash 不带月份 |
| 样式 | `styles/lookup.scss` | 由根 `styles.scss` 引入，全取 `var(--…)`，**无任何媒体查询** |

`pnpm lookup:check` 实测通过，生成物与源表一致。

### 2.2 数据规模与实体基数

| 实体 | 基数 | 现有正向索引 | 反向查询能力 |
|---|---|---|---|
| INCH 组合 | 6 种：`39/31`、`65/55`、`77/27`、`77/42`、`77/48`、`83/48` | `byInch` | 有 |
| GLS 型号 | 110 | `byModel` | 型号 → 唯一组合 |
| JIG P/N | 24 | `byJig` | 有 |
| Recipe | 24 | `byRecipe` | 与 JIG 一一对应 |
| FSPM | 92 | 仅 `fspm` 属性表 | **完全没有**（v1 §9 明确列为「本次不做」） |
| 组合 `LookupGroup` | 48 | 仅 `groups` 数组 | 无独立入口 |

组合×FSPM 关系 284 条，型号×尺寸记录 220 条。

### 2.3 反向关联实测（本次最大增量）

对 48 个组合的 `mainFspm` / `subFspm` 逐一展开统计：

- 92 个 FSPM **全部被至少一个组合引用**，没有孤儿项；
- **81 个被 ≥2 个组合引用**，最多的一个被 9 个组合引用；
- 引用组数分布：1 组 11 个、2 组 47 个、3 组 7 个、4 组 2 个、5 组 15 个、6~9 组共 10 个；
- 例：`P467` 被 5 个组合的 Main 引用（`7727C-02`、`7742C-01`、`7742C-04` 等）；`P526` 只在 `3931C-01` 的 Main 出现一次。

结论：FSPM → 组合/型号的反向索引一做就有内容，不需要补数据。

### 2.4 关键巧合：`7748`

| 视角 | 命中 | 组合数 |
|---|---|---|
| INCH `77/48` | 一个英寸实体 | 12 |
| JIG 前缀 `7748*` | `7748B`(3) / `7748C`(4) / `7748D`(2) / `7748E`(1) / `7748F`(1) / `7748G`(1) | 12 |

逐组比对确认：**两边是同一批 12 个组合**。所以当前快照下两种口径结果集相同，只是「按尺寸归类」还是「按夹具系列归类」。这是当前数据的巧合：一旦 `77/48` 配上非 7748 系的 JIG，或 7748 系被用到别的英寸，两种口径立刻分叉。因此别名规则必须显式定义，不能靠猜。

---

## 3. 已确认的四项决策

| # | 议题 | 决定 |
|---|---|---|
| 1 | `7748` 的口径 | **默认归一到 INCH `77/48`**，Enter 一步到该英寸结果页；建议列表同时并列 6 个 `7748*` JIG 候选，带类型徽标，用户可点选按夹具系列看 |
| 2 | command 形态 | **页内常驻统一输入框**，替代现有双 Tab；不做 `⌘K` 浮层（可选加 `Ctrl/⌘+K` 聚焦同一个输入框，放 P4） |
| 3 | 预设展示维度 | **INCH / GLS 型号 / FSPM / JIG·Recipe 四个全要**，另加一个默认总览 |
| 4 | 结果页结构 | **共用外壳 + 类型区块**；`model` 原样复用现有 `ModelResult`（含同 INCH 对比） |

第 1 项的来龙去脉：用户原话是「搜索 inch 元素 7748」，即 `7748` 在现场指代 `77/48` 这个尺寸组合；同时四个展示维度全保留，按夹具系列的视角本来就能从「按 JIG」展示页进入。所以这题只决定 command 的默认落点，选「INCH 优先 + 并列候选」兼顾一步到位与不丢视角。

---

## 4. 总体架构

```
预设展示页（默认落地）  ─┐
                        ├─→ 选定一个实体 ─→ 统一关联结果页 ─→ 可点 chips
统一 command 输入框    ─┘        ↑                              │
                                 └────────── 重新发起 command ───┘
```

两条入口的终点是同一个 `EntityRef { type, key }`，写进同一份 hash 状态；区别只在「怎么找到这个实体」。结果页的 chips 指回 command，用户不必退回搜索框。

### 4.1 hash 设计

| hash | 视图 |
|---|---|
| `#/lookup` | 默认总览 |
| `#/lookup/browse/inch`、`/browse/model`、`/browse/fspm`、`/browse/jig` | 维度展示页 |
| `#/lookup/inch/77%2F48` | INCH 实体结果 |
| `#/lookup/model/FY` | 型号实体结果（**与 v1 完全相同**） |
| `#/lookup/jig/7748G`、`#/lookup/recipe/310(10)` | JIG / Recipe 实体结果 |
| `#/lookup/fspm/P467` | FSPM 实体结果 |
| `#/lookup/group/7748G-01` | 单组合详情 |

### 4.2 旧深链兼容（P3 必须覆盖）

| 旧 hash | 兼容方式 |
|---|---|
| `#/lookup/model/FY` | 原样解析为 `{ type: 'model', key: 'FY' }` |
| `#/lookup/jig/7748G` | 原样解析为 `{ type: 'jig', key: '7748G' }` |
| `#/lookup/jig/310(10)` | `jig` 查不到 P/N 时按 Recipe 回退命中，结果与 v1 的 `findJig` 一致 |
| `#/lookup/FY` | 手敲兼容，默认按 `model` 解析 |

写入仍用 `window.history.replaceState`，**不压历史**；输入过程中的临时文字不进 hash。

---

## 5. 实体与关联模型

### 5.1 实体类型

```ts
export type EntityType = 'inch' | 'model' | 'jig' | 'recipe' | 'fspm' | 'group'
export interface EntityRef { type: EntityType; key: string }
```

`group` 是内部实体：展示页不单列维度，由组合卡、对比表行、关联组合列表点入。

### 5.2 关联查询（纯函数）

```ts
/** FSPM 的一次引用：哪个组合的哪个位置用到了它 */
export interface FspmRef { id: string; groupId: string; part: 'main' | 'sub' }

export interface Relations {
  groups: readonly LookupGroup[]
  models: readonly string[]
  jigs: readonly JigEntry[]
  recipes: readonly string[]
  fspm: readonly FspmRef[]
  inches: readonly string[]
}

export function relationsOf(index: LookupIndex, ref: EntityRef): Relations
```

`relationsOf` 放 `core/relations.ts`，零 DOM 依赖、可穷举单测。所有关联都从现有索引推导，不新增运行时数据文件。

### 5.3 各实体的结果应包含什么

| 实体 | 关联结果 |
|---|---|
| `inch` | 该英寸下全部组合、涉及型号、JIG/Recipe、用到的 Main/Sub FSPM；按 JIG 分组统计 |
| `model` | **沿用 v1 `ModelResult`**：条件卡 + 组内等同型号 + 主副 FSPM 表 + 同 INCH 对比 |
| `jig` / `recipe` | **沿用 v1 `JigResult`**：条件卡 + 型号 chips + 每个组合一张卡 |
| `fspm` | 属性卡（尺寸 / 厂家 / 材质 / Bezel）+ 被哪些组合的 Main 或 Sub 引用、对应型号与 INCH |
| `group` | 单组合详情：组内等同型号 + 双 FSPM 面板 |

---

## 6. Command 设计

### 6.1 归一化与别名

沿用 `normalizeKey`（`NFKC` → 去所有空白 → 转大写），在 `core/entities.ts` 里加 INCH 紧凑化，**只用于 inch 候选**：

```ts
const compact = (s: string) => normalizeKey(s).replace(/[^0-9A-Z]/g, '')
// compact('77/48') === compact('77-48') === compact('7748') === '7748'
```

于是 `77/48`、`77-48`、`77 48`、`7748`、全角 `７７／４８` 都归一到同一个 INCH 键。紧凑化**不用于** Recipe（`310(10)` 会变成 `3110`，容易误命中），Recipe 仍走完整键匹配。

### 6.2 候选生成与打分

复用 `indexes.ts` 现有的 `scoreOf`（完全相等 0 > 前缀 1 > 子串 2，不匹配 −1），叠加实体类型优先级：

| 优先级 | 类型 | 理由 |
|---|---|---|
| 0 | `inch` | 保证 `7748` 首项是 INCH（决策 1） |
| 1 | `model` | 现场最高频 |
| 2 | `fspm` | 本次新增能力 |
| 3 | `jig` | 与 recipe 等价 |
| 4 | `recipe` | 同上 |
| 5 | `group` | 只在输入接近完整组合 ID 时出现 |

同分内按字母序。建议列表**按类型分组**，每组最多 6 条、总上限 18 条。**不显示「还有 N 条」提示** —— v1 方案写了这条但实现没做，本文明确不列入范围，避免再次留下方案与实现的偏差。

候选副标题给出可判断的摘要：INCH 显示组合数 / 型号数，型号显示所属组合与 INCH，FSPM 显示尺寸与被引用组数，JIG 显示 Recipe 与组合数。

### 6.3 建议列表与键盘

- 沿用 `Popover` + 自建 `role="listbox"`，**不引 cmdk**；输入框保留 `combobox` / `aria-expanded` / `aria-controls` / `aria-activedescendant`。
- 每项带类型徽标（如 `INCH 77/48`、`JIG 7748G`、`FSPM P467`），命中片段 `<mark>` 高亮。
- ↑/↓ 循环移动高亮，Enter 选中高亮项（无高亮取首项），Esc 关浮层（**不清空输入**，与现有实现一致），清空按钮同时清空输入与选择。
- 可选前缀语法 `inch:7748` / `fspm:P467` 强制类型，放 P4。

### 6.4 `7748` 的完整行为

1. 输入 `7748` → 候选第 1 项是 `INCH 77/48`（副标题「12 组合 · N 型号」）；
2. 同一列表下方按类型分组列出 `JIG 7748B` … `7748G` 六项（各带组合数与 Recipe）；
3. 直接按 Enter → 落到 `#/lookup/inch/77%2F48`，展示 12 个组合；
4. 想按夹具系列看 → 点某个 JIG 候选，落到对应的 JigResult；或从「按 JIG」展示页进入。

---

## 7. 预设展示页

### 7.1 默认总览（`#/lookup`）

取代现有空态：数据规模一句话（快照日期 / 48 组 / 110 型号 / 92 FSPM）、四个维度入口卡（各带条目数）、常用组合快捷入口、`LookupFootnote`。command 输入框常驻在页头，两种用法不需要切换。

### 7.2 四个维度共用一个 `BrowseBoard`

遵守 AGENTS 的「复用阈值 ≥2」：四种维度用**同一个组件**，只换数据源与卡片渲染配置，不写四套页面。

| 维度 | 条目 | 卡片信息 | 点击 → |
|---|---|---|---|
| `inch` | 6 | 英寸 + 组合数 + 型号数 | `inch` 结果 |
| `model` | 110 | 型号 + 所属组合 + INCH；按 INCH 或字母序分组 | `model` 结果 |
| `fspm` | 92 | P 号 + 尺寸 / 厂家 + 被引用组数；按尺寸或厂家分组 | `fspm` 结果 |
| `jig` | 24 | JIG P/N + Recipe + 组合数 | `jig` 结果 |

点卡片等价于 command 选中该实体：走同一个 `lookupView`，写同一套 hash。`BrowseBoard` 自身可带一个轻量筛选框（与 `CompareTable` 的筛选同一形态），但筛选词不进 hash。

---

## 8. 统一关联结果页

### 8.1 共用外壳 `EntityResult`

1. **头部**：类型徽标 + 键 + 一句统计（例：`INCH 77/48 · 12 组合 · 6 个 JIG · N 个型号`）；
2. **关联组合列表**：所有实体共用，复用 `GroupCard` 的紧凑形态或 `CompareTable` 的行；行可展开看主副 FSPM；
3. **关联实体 chips**：型号 / JIG / Recipe / FSPM / INCH 分组，复用 `LookupChip`，**全部可点**；
4. **类型专属区块**：见 8.2；
5. **数据脚注**：复用 `LookupFootnote`。

`model` 类型下把「关联组合列表」折叠进「同 INCH 对比」区块，避免与 `ModelResult` 的条件卡重复。

### 8.2 类型专属区块

| 类型 | 区块 |
|---|---|
| `model` | 整块复用 v1 `ModelResult`（条件卡 + 主副 FSPM 表 + 同 INCH 对比），不重写 |
| `fspm` | 新增 `FspmResult`：属性卡 + 「被引用位置」表（组合 ID / Main 或 Sub / 型号 / INCH） |
| `inch` | 新增 `InchResult`：按 JIG 分组统计条 + 关联组合卡列表。**不接 `CompareTable`** —— 对比需要一个「当前组合」作基准，而 inch 维度本身没有基准；需要逐组对比时从统计条点进某个 JIG，或直接看组合卡的主副 FSPM |
| `jig` / `recipe` | 整块复用 v1 `JigResult` |
| `group` | 单张 `GroupCard` 展开态 |

### 8.3 漫游闭环

结果页所有 chips 都是链接，点击即 `navigate('lookup', { lookupView: { kind: 'entity', type, key } })`。例：`FY` 结果 → 点 `P467` → FSPM 结果（5 个引用组合）→ 点其中某个组合 → 单组合详情 → 点 `77/42` → INCH 结果。这条路径是「覆盖没有明确目的」的另一半，实现时不能把 chips 做成纯文本。

### 8.4 首屏高度

单层 `canvas-flow` 滚动约定不变。关联组合列表默认展示前若干组 + 「展开全部」，类型专属区块可折叠，避免一屏塞满。

---

## 9. 数据层与索引

### 9.1 新增 / 扩展

| 文件 | 改动 |
|---|---|
| `core/entities.ts`（新） | `EntityType`、`EntityRef`、INCH 紧凑归一、实体候选构建与打分、`compactInchKey` |
| `core/relations.ts`（新） | `FspmRef`、`Relations`、`relationsOf` 纯函数 |
| `core/indexes.ts` | 加 `byFspm: ReadonlyMap<string, FspmRef[]>`、`byGroup: ReadonlyMap<string, LookupGroup>`；导出 `searchEntities` |
| `core/types.ts` | 加 `EntityType` / `EntityRef`；`LookupSelection` 由 `LookupView` 取代（可保留 type alias 兼容） |
| `core/normalize.ts` | 扩 INCH 别名归一，通用 `normalizeKey` 行为不变 |
| `core/instance.ts` | 仍是一行 `buildLookupIndex(...)`，不改 |

`byFspm` 在 `buildLookupIndex` 里遍历每个组合的 `mainFspm` / `subFspm` 生成，排序后稳定输出。

### 9.2 明确不动

`docs/JIG-查询表.xlsx`、`docs/JIG-FSPM-属性表.xlsx`、`scripts/build-lookup-data.mjs`、`src/features/lookup/data/lookupData.ts` 一律不动。反向索引是运行时推导，**不需要重跑 `pnpm lookup:data`**；`pnpm lookup:check` 仍作为验收项跑一次确认快照未漂移。

---

## 10. 路由与状态

`AppLocation.lookup: LookupSelection | null` 改为类型化的单一视图状态：

```ts
export type LookupView =
  | { kind: 'home' }
  | { kind: 'browse'; dim: LookupDimension }   // 'inch' | 'model' | 'fspm' | 'jig'
  | { kind: 'entity'; type: EntityType; key: string }

// AppLocation.lookupView: LookupView（默认 { kind: 'home' }）
```

连带改动：`src/appLocation.ts` 的 `parseLocation` / `buildHash` 集中处理 `browse` 段与六类实体段，兼容 4.2 的旧深链；`src/App.tsx` 的 `navigate` options 由 `lookup` 改为 `lookupView`，`hrefs.lookup` 仍指向 `#/lookup`；`LookupScreen` 按 `lookupView.kind` 编排 home / browse / entity 三种视图。组件内部状态（command 输入、浮层开合、筛选词、展开集合）仍只在组件里，**不进 localStorage、不进备份**。

顶栏行为不变：`showPeriodNav = false`，显示「数据快照 `<LOOKUP_DATA_VERSION>`」。

---

## 11. 文件清单

| 处置 | 文件 |
|---|---|
| 新增 | `core/entities.ts`、`core/relations.ts`、`components/LookupCommand.tsx`、`LookupHome.tsx`、`BrowseBoard.tsx`、`EntityResult.tsx`、`FspmResult.tsx`、`InchResult.tsx` |
| 修改 | `core/types.ts`、`indexes.ts`、`normalize.ts`、`components/LookupScreen.tsx`、`styles/lookup.scss`、`src/appLocation.ts`、`src/App.tsx`、`src/appLocation.test.ts` |
| 复用 | `ModelResult`、`JigResult`、`GroupCard`、`CompareTable`、`FspmTable`、`LookupChip`、`ChangeBadges`、`LookupFootnote`、`LookupEmpty`（改作「command 无匹配」提示或退役） |
| 退役 | `components/LookupSearch.tsx`（双 Tab 搜索，由 `LookupCommand` 取代） |
| 新增测试 | `__tests__/entities.test.ts`、`__tests__/relations.test.ts`；扩 `__tests__/indexes.test.ts`、`src/appLocation.test.ts` |

目录归位：纯规则进 `core/`，可复用展示块进 `components/`，状态入口集中在 `src/appLocation.ts`。

---

## 12. 分期

| 阶段 | 交付物 | 完成判据 |
|---|---|---|
| P0 | `entities.ts`、`relations.ts`、`byFspm` / `byGroup`、纯函数单测 | **已完成 2026-11-12**：UI 零变化，40 文件 / 608 用例全通过（原 583 + 新增 25） |
| P1 | `LookupCommand` + `EntityResult`（先保 model / jig 兼容） | **已完成 2026-11-12**：一个输入框出六类候选并落到结果页，`7748` 首项 INCH；`lookupView` 路由 + 四个旧深链兼容；40 文件 / 614 用例通过 |
| P2 | `LookupHome` + `BrowseBoard` 四维度 | **已完成 2026-11-12**：`#/lookup` 默认总览（四维度卡片 + 快速入口）；`#/lookup/browse/<dim>` 可浏览与筛选，点条目进实体结果；40 文件 / 619 用例通过 |
| P3 | `FspmResult` / `InchResult`、旧深链兼容、文档同步 | **代码已完成 2026-11-12**：六类实体结果完整、返回浏览板、chips 与脚注统一；40 文件 / 619 用例通过。README §2 / DESIGN §5 的同步**待确认** |
| P4（可选） | 类型前缀语法、`Ctrl/⌘+K` 聚焦输入框、组合列表虚拟滚动 | **前缀与快捷键已完成 2026-11-12**：`fspm:P467` / `inch:7748` 等只搜指定类型；`Ctrl/⌘+K` 聚焦同一输入框。虚拟滚动未做（单维度最多 110 项，不需要） |

---

## 13. 测试与验收

**新增单测**（vitest）：

- INCH 别名：`7748` / `77-48` / `77 48` / 全角都归一到 `77/48`；`310(10)` 不被紧凑化误命中；
- `relationsOf` 六类实体的关联集合，含 `P467 → 5 组`、`P526 → 1 组`、某个 FSPM 跨 Main/Sub 的情形；
- `7748` 候选首项必须是 `inch`，且并列给出 6 个 `7748*` JIG；
- `byFspm` 覆盖全部 92 个 FSPM，引用位置与组合的 `mainFspm` / `subFspm` 一致；
- hash 往返：`browse/*`、六类实体段、4.2 的四个旧深链。

**常规验收**：`pnpm build`（含 `tsc --noEmit`）、`pnpm test`（现有 38 文件 / 583 用例不回归）、`pnpm lookup:check`。按用户约定，**实机 / 端到端验收（拉起 Tauri 窗口、点击与截图）需单独申请**，不在常规验收内；非必要不截图、不跑全量 verify。

**闸门**：开工前读 `DESIGN.md` + `README.md`；样式只取 `var(--…)`；复用阈值 ≥2；改完跑 build / test。

---

## 14. 风险与取舍

| 风险 | 应对 |
|---|---|
| `7748` 多义 | 默认 INCH + 并列 JIG 候选 + 类型徽标；系统不替用户猜其它类型 |
| 候选重名（型号名撞 FSPM id 等） | 按类型分组展示，不做自动消歧；前缀语法可作强制手段 |
| 结果页信息过载 | 组合列表默认折叠、类型区块可折叠，保持一层滚动 |
| 展示页与结果页重复 | 两者写同一个 `lookupView`，点卡片与 command 选中是同一条路径 |
| v1 文档与实现有偏差 | v1 文档 §4 的 Esc 清空、8 条超出提示、FSPM 表列、行点击、展开按钮等细节与代码不一致；本文第 2 章以代码为准，实现时若再发现偏差先改代码再改文档 |
| 旧深链被分享出去 | P3 单测覆盖四个旧 hash，保证刷新 / 前进后退 / 手工输入仍可复现 |
| 数据量增长 | 索引仍运行时一次构建、无防抖；条目上千再评估虚拟滚动 |

---

## 15. 实施前须知

- 本文是**方案定稿，未实施**。实现时按 P0 → P3 推进，每期结束跑第 13 章的常规验收。
- `docs/lookup-plan.md` 是 v1 的历史记录，其中「第四个一级页面」「只在桌面侧栏出现」等表述已滞后（现为五个一级页面、Web 静态版也显示）；**不要照抄**。
- 实现完成后需要同步的既有文档：`README.md` §2 功能表（补生产速查）、`DESIGN.md` §5 路由表（补展示页与实体深链）、`docs/lookup-plan.md` 顶部状态（标注已被本文取代为当前设计）。按用户约定，**改这些文档前先确认**。
