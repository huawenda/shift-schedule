# UI System Audit

This audit records the first pass of standardizing the home and statistics pages against `PRODUCT.md` and `DESIGN.md`.

## Scope

- Home page: `apps/miniapp/src/pages/index/index.scss`
- Statistics page: `apps/miniapp/src/pages/stats/index.scss`
- Global app shell: `apps/miniapp/src/app.scss`
- Shared design tokens: `apps/miniapp/src/styles/design-tokens.scss`

## Findings

### 1. Product Register

The project is a product UI, not a brand or marketing surface. The interface should optimize for schedule scanning, role clarity, sync trust, and mobile readability.

Design direction: light, friendly, practical.

### 2. Drift Before This Pass

- Page shell backgrounds were repeated in page files.
- Buttons on the home and statistics pages were visually similar but separately implemented.
- Card surfaces, radii, borders, and shadows were repeated across pages.
- Shift colors were duplicated in multiple selector families, with small mismatches between pages.
- Loading spinners and disabled/loading states used hard-coded colors.
- Inputs and field surfaces shared a visual language but were not tokenized yet.

### 3. Standardization Applied

- Added `apps/miniapp/src/styles/design-tokens.scss` as the shared SCSS token and mixin layer.
- Connected global background and app shell to shared canvas and shadow tokens.
- Connected home and statistics page shells to a shared `page-shell` mixin.
- Connected primary/secondary/sync pill buttons to a shared `pill-control` mixin where safe.
- Connected cards to a shared `card-surface` mixin for major page surfaces.
- Connected loading spinners to a shared `spinner` mixin.
- Connected home and statistics shift chips to shared semantic shift tokens.
- Preserved current layout behavior and avoided large visual rewrites in this pass.

## Tokenization Strategy

Keep the SCSS token layer small and practical:

- Use SCSS variables and mixins because they compile cleanly for the WeChat mini program output.
- Do not introduce a new component library for this Taro app.
- Use shared mixins for stable product primitives: page shell, cards, pill controls, fields, spinners, semantic chips.
- Keep highly contextual table layout rules inside page SCSS until the repeated patterns are clearer.

## Next Refactor Targets

1. Extract field/input styles for salary inputs, overtime inputs, and profile binding inputs.
2. Extract segmented controls for month tabs, view tabs, auth tabs, and table view toggles.
3. Normalize status text styles for sync, salary save, loading, error, and empty states.
4. Reduce remaining hard-coded neutrals in table rows, dividers, and secondary labels.
5. Review mobile spacing after tokenization with WeChat devtools screenshots.

## Rules For Future UI Changes

- Check `DESIGN.md` before adding a new color, radius, shadow, or font size.
- Prefer `apps/miniapp/src/styles/design-tokens.scss` for product primitives.
- If a selector duplicates a button, card, chip, field, or spinner pattern, add or reuse a mixin instead of hard-coding.
- Preserve the semantic shift color mapping across home, statistics, salary, and future pages.
- Keep visual changes incremental and verified on mini program builds.

---

# Round 2 Audit (2026-10-23)

第二轮全量审计：通读 `apps/miniapp/src` 全部页面 / 组件 / 样式，并与 `apps/web` 源码逐点对照验证。

## P1 功能性缺陷（应修）

### 1. 日历滑动手势失效 — `components/MonthCalendar.tsx`
只挂了 `onTouchEnd`，且起点从 `event.touches[0]` 取。微信小程序在 touchend 时
`touches` 已清空，起点永远是 `undefined` → `onSwipe` 不会触发，
「左右滑切换月份」实际不可用。Web 端（`MonthCalendar.tsx`）是
`onTouchStart` 存 ref + `onTouchEnd` 用 `changedTouches`，照 stats 页
`handlePersonalPageTouchStart/End` 的正确写法修即可。

### 2. 统计页顶栏第二行重复渲染 — `pages/stats/index.tsx`
连续两个 `<View className="stats-head-tools">`（第一个只有结算周期、
第二个是周期 + 同步按钮），「结算周期」文字出现两次、两条 border-bottom。
第一块是遗留代码，应删除。

### 3. 顶栏标题与胶囊对齐参数过时 — `pages/index/index.tsx` ↔ `styles/web-ui.scss`
`brandLineHeightRpx = 48`（注释称 `.brand` line-height 24px），但
`web-ui.scss` 的 `.brand` 实际是 `line-height: 20px` → 40rpx。
传入值偏大 8rpx，标题会比胶囊视觉中心偏上 ~2px。
二选一：TS 改传 40 并更新注释，或 SCSS 改成 24px——两边必须一致。

## P2 几何常量与 SCSS 失配（横向滚动定位不准）

### 4. 月份轨几何是估算值 — `pages/index/index.tsx`
`monthTabWidth = rpx(52)` / `monthTabGap = rpx(4)` 与实际不符：
`.rail-item` 无固定宽（文本自适应，「5月」≈54px、「10月」≈65px+）、
无 margin gap、只有 13px×2 内边距。误差逐月累计，
后面的月份自动滚动定位会偏。建议用 ` createSelectorQuery ` 测实际位置，
或给 `.rail-item` 定宽让常量真实成立。

### 5. 矩阵 today 居中少算一侧版心 — `pages/index/index.tsx`
`getCenteredTableScrollLeft` 的可见宽度用 `750 - 28 - 168 = 554rpx`，
实际是 `750 - 56（左右两侧 page-pad）- 168 = 526rpx`，居中偏右 ~7px。
另外按姓名模式下 `.m-body` 宽变成 56px，公式没有跟着切换。

## P3 状态与反馈

### 6. 同步浮层提前喊「完成」 — `pages/index/index.tsx`
`refreshHintVisible` 在请求发出时就置 true，同步进行中浮层已经显示
「云端同步完成」。应按 `cloudRefreshing` 分支显示「同步中…/已完成」。

### 7. 滚到底部触发整包云端刷新 — `pages/index/index.tsx`
`onScrollToLower={refreshCloudOverrides}`：用户滚到矩阵底部就会触发
云端同步 + toast。与下拉刷新语义重复且出乎意料，建议去掉（或改静默刷新）。

## P4 代码卫生

- `pages/stats/index.tsx` 本地复制了 `monthOptions` 和 `defaultPersonName = '华文达'`；
  `appConstants.ts` 已有同源导出（`monthOptions` / `defaultCurrentUserName`），双份必然漂移。
- 死类名：TeamMatrix 的 `is-edited` / `is-legal`、MonthCalendar 的
  `has-overtime` / `has-legal` 无对应样式（视觉由 `.mark-dot` 承担）。
- `ShiftEditorSheet` 的 `isSaving` 恒为 `false`（index 传死值 `isSaving={false}`）。

## P5 可用性 / 可访问性

- 触控目标偏小：`.stepper-btn` 26×26、`.act` 高约 30px、`.choice` 高约 28px，
  低于 44px 建议值。至少给 stepper 与 act 补 hit-area padding。
- 墨牌上 50% 透明度小字（`.p-label` 11px、`.today-line` 12px）对比度约 4:1，
  对小字号偏紧，建议提到 0.6（与 `.shift-range` 的 0.6 统一）。
- 统计页头部/标签/筛选行实际会随内容滚出屏幕（ScrollView 高度为 auto，
  整页走原生滚动），与代码注释「头部固定、内容区各自滚动」的宣称不符。
  若要固定需给 `.stats-page` 定高 100vh + 内部 ScrollView 定高。真机确认。

## 与 Web 对齐的确认项（本轮核对无误）

- `.plaque` 无圆角、值班牌内边距取 ≤720px 断点的 14/16 —— 与 Web 一致。
- 矩阵格 28px / 色块 25px / 字号 9px —— 移动断点值正确。
- `.rhythm-bar`、`.swatch` 不声明默认底色，避免覆盖 `.s-*` 班次色 —— 正确。
- 值班牌 tally 项、金额口径（`salaryCalculation.hourlyWage`）—— 与 Web 一致。
- 两行式顶栏（排班页 / 统计页）+ `getHeaderTopPadding` 主体逻辑 —— 正确。

---

# Round 2 Fix Pass (2026-10-23，同日)

审计当日的修复记录。`pnpm verify:miniapp` 退出码 0。

## 已修复

| 审计项 | 修法 |
|---|---|
| P1-1 日历滑动手势失效 | `MonthCalendar.tsx` 补 `onTouchStart` 存起点 ref，touchend 用 `changedTouches`，纵向滚动（\|dx\|≤\|dy\|）不触发换月——与 Web 端/统计页同款写法 |
| P1-2 统计页顶栏重复渲染 | 删除第一个 `.stats-head-tools` 遗留块 |
| P1-3 `.brand` 行高失配 | `web-ui.scss` 的 `.brand` line-height 20px → **24px**（与两行式顶栏定案、index 传的 48rpx 对齐）；同时删除 index.tsx 里同名死函数 `getHeaderTopPadding()` 及过时注释 |
| P2-4 月份轨常量失配 | 首帧后用 `createSelectorQuery` 实测各 `.rail-item` 的内容坐标（存 `monthTabRectsRef`），量完按当前月份重新校正滚动位置；旧常量 `monthTabWidth/Gap` 降级为实测失败时的兜底，删除无用的 `monthTabsHorizontalPadding` |
| P2-5 矩阵居中少算 page-pad | 可见宽度改 `750 - 2*pageHorizontalPadding - identityColumnWidth`；`getCenteredTableScrollLeft` 接受列宽参数，按姓名视图传 `rpx(56)`，effect 依赖补 `tableView` |
| P3-6 同步浮层提前喊完成 | 浮层文案按 `cloudRefreshing` 分支显示「同步中…/云端同步完成」 |
| P3-7 滚到底触发同步 | 删除 `onScrollToLower={refreshCloudOverrides}` |
| P4 死代码 | TeamMatrix 删 `is-edited`/`is-legal`；MonthCalendar 删 `has-overtime`/`has-legal` 类名（mark-dot 逻辑保留）；stats 页 `monthOptions`/默认人名改从 `appConstants` 引入 |
| P5 对比度 | `.p-label`/`.tally-label`/`.today-line` 透明度统一 0.6（原 0.5/0.55） |

## 未修（留待后续）

- 触控目标偏小（stepper 26×26、.act ~30px 高）——改尺寸影响顶栏布局，需真机验收后再动。
- 统计页头部随内容滚出屏（ScrollView 高 auto）——需真机确认期望行为后决定是否定高。
- `ShiftEditorSheet` 的 `isSaving` 恒为 false——保留接口，待接入真实保存态。
