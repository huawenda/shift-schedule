# 小程序 UI 审计（对照 Web 端 ≤720px 移动断点）

日期：2026-10-23
范围：`apps/miniapp`（Taro 4.2 / designWidth 375）对照 `apps/web` 移动断点
基准：`apps/web/src/styles/{tokens,chrome,schedule,stats}.scss` 的 `@media (max-width: 720px)` 段

## 0. 结论

静态审计共发现 **12 项可确认的移植缺陷**，其中 2 项属于「功能看起来坏掉」级别：

| 级别 | 数量 | 性质 |
|---|---|---|
| P0 | 2 | 视图错位 / 关键交互反馈完全缺失 |
| P1 | 5 | 视觉与 Web 明显不一致，或布局定位失效 |
| P2 | 2 | 尺寸字号偏离移动断点，连锁放大 |
| P3 | 3 | 细节偏差 |

另有 2 项两端共有、但在小程序上更痛的问题（触控目标过小）。

「比 Web 移动端差很多」的主要来源按感知强度排序：
1. **点哪儿都没反应**（零按压反馈）—— P0-2
2. **顶栏吃掉 181px**，首屏只剩半屏内容 —— P1-5
3. **按姓名视图表头与内容整体错开** —— P0-1
4. **矩阵里休息日变成空白**，Web 是浅绿实心块 —— P1-4
5. **左侧姓名列竖线每行断开**，看起来像虚线 —— P1-3

---

## 1. P0：阻断级

### P0-1 按姓名视图：表头列宽 38px，内容列宽 56px，整体错位

| | 位置 |
|---|---|
| 缺陷 | `apps/miniapp/src/styles/web-ui.scss:937-950` |
| 表头列宽 | `web-ui.scss:863-875` `.gh { width: ds.$cell-w }` → 38px |
| 内容列宽 | `web-ui.scss:917-919` `.m-body.is-name { width: 56px }` |
| Web 对照 | `schedule.scss:459-461` `.grid-row { grid-template-columns: 64px repeat(var(--days), 56px) }` —— 表头与内容在同一 grid 里，一起变成 56px |

`.matrix.is-by-name` 只覆盖了 `.m-body` 和 `.mn`，**漏了 `.gh`**。表头每列 38px、内容每列 56px，第 30 列累积偏差 540px，日期与格子完全对不上。

旁证：`pages/index/index.tsx:320` 的居中定位已经写了 `tableView === 'name' ? rpx(56) : dateColumnWidth`，说明预期列宽确实是 56px，只有样式没跟上。

修复：`.matrix.is-by-name .gh { width: 56px }`。

### P0-2 全应用零按压反馈

全仓库检索结果：`hoverClass` / `hover-class` / `:active` **一处都没有**。

Web 端的对应实现：

| Web 位置 | 效果 |
|---|---|
| `schedule.scss:207-209` `.cell:active:not(:disabled) { transform: scale(0.97) }` | 日历格按下缩一下 |
| `schedule.scss:204` `.cell { transition: transform 90ms ease }` | 过渡 |
| `chrome.scss:226-236` `.choice-row button:hover` / `[aria-pressed]` | 选项 hover 描边变色 |
| `tokens.scss:215` `.act { transition: background-color 120ms, color 120ms }` | 按钮过渡 |
| `tokens.scss:218-229` `.act:hover` / `.act-ink:hover` | 按钮 hover 反馈 |

小程序里 `View` 原生支持 `hoverClass`（微信会加 `hover-class` 到节点并在按下时切换），Taro 透传该属性即可，不需要 JS。当前所有可点元素（日历格、矩阵格、月份 tab、按钮、选项、列表项）按下都是死的，这是「手感差」的第一来源。

建议：在 `design-tokens.scss` 增一个 `@mixin pressable`，统一给 `.cal-cell`、`.m-body`、`.act`、`.choice`、`.picker-item`、`.rail-item`、`.tab` 加 `hover-class`。

---

## 2. P1：视觉与布局

### P1-1 缺全局 `box-sizing: border-box`（实测推翻，见第 8 节）

| | 位置 |
|---|---|
| 缺陷 | `apps/miniapp/src/app.scss` 全文无 `* { box-sizing: border-box }`；产物 `dist/app.wxss` 首段可确认只有 `page/body/#app` 的背景与字体 |
| Web 对照 | `tokens.scss:66-69` `* { box-sizing: border-box; -webkit-tap-highlight-color: transparent }` |

Web 靠这条全局规则让「固定宽高 + padding + border」的元素尺寸可控，小程序里同类元素全部变成 content-box。已确认受影响 4 处：

| 选择器 | 声明 | Web 实际 | 小程序实际 | 后果 |
|---|---|---|---|---|
| `web-ui.scss:1122-1131` `.hours-field` | `width:92px; padding:0 9px; border:1px` | 92px | **112px** | 改班弹层时数输入框宽 20px，右侧「小时 · 最小单位 0.5」被挤 |
| `web-ui.scss:1097-1102` `.shift-choice .shift-block` | `width:34px; padding:0 5px` | 34px | **44px** | 班次选项块变宽，一排装不下，提前换行 |
| `web-ui.scss:1168-1175` `.sheet-cancel` | `width:88px; border:1px` | 88px | **90px** | 轻微 |
| `web-ui.scss:917-919` `.m-body.is-name` | `width:56px; padding:0 1.5px` | 56px | **59px** | 叠加 P0-1 的错位 |

注意：`.cal-cell`、`.cell-face`、`.sheet`、`.bind-picker` 各自声明了 `box-sizing`，所以日历没崩；问题是这类「逐处补丁」漏掉了弹层控件。

### P1-2 同步提示浮层定位失效，会盖住月份切换器

`web-ui.scss:353-369` 把 `.cloud-refresh-status` 固定在 `position:absolute; top:96px`。

顶栏改成两行式后实际纵向占用（iPhone 390 宽实测参数）：
```
paddingTop ≈ 51px   (getHeaderTopPadding: 胶囊 top 48 + (32-25)/2)
.masthead      min-height 44px   → 51 .. 95
.masthead-tools min-height 44px  → 95 .. 139
.rail          42px              → 139 .. 181
```
`top:96px` 正好落在 `.masthead-tools` 的第一像素上，30px 高的提示条覆盖 96..126，压住月份 `‹ 10月 ›` 与「同步 / 统计」按钮。

修复：改成 `top: 139px`（或用 CSS 变量按行高累加），或干脆改成 `position: fixed` 底部 toast。

### P1-3 矩阵左列竖线每行断开 2px

`.mn`（`web-ui.scss:798-808`）用 `box-shadow: 1px 0 0 ds.$rule` 画右侧竖线，而相邻两行之间靠 `margin-top: 2px` 留色块间距——这 2px 里没有任何元素，竖线因此断开。

Web 端专门处理过这个接缝：`schedule.scss:785-797` 用 `.grid-head::after { top:100%; height:2.5px; left: var(--name-col) }` 补一段竖线，注释里明确写了「不能靠负 margin，会把纸色背景拉高盖住横向框线」。

小程序没有对应补丁。30 行 × 每行 2px 断口，视觉上姓名列右边线是虚线。

修复：`.matrix-names` 上叠一条 `right:0` 的 1px 竖线，或给 `.mn` 用 `border-right` + `margin` 改为 `padding` 实现间距。

### P1-4 矩阵里休息格丢底色（实测推翻，见第 8 节）

| | 位置 |
|---|---|
| 缺陷 | `web-ui.scss:908-911` `.m-body.is-blank .shift-block { background: transparent; color: ds.$s-rest-bar }` |
| Web 对照 | `schedule.scss` **没有** `.m-body.is-blank` 的任何规则（`TeamMatrix.tsx:145` 只加类名，无配套样式），所以休息格保留 `.s-rest` 的底色 `#c9d7c3` + 字色 `#3f5b47` |

结果：Web 全员矩阵里休息日是浅绿实心块，小程序里是「没有底色、只有浅绿字」的空格。这一条让整个矩阵的节奏感变了——休息日不再成块，扫读时看不出排班密度。

`is-blank` 的写法疑似从 `.rhythm-bar.s-rest { background: transparent }`（`web-ui.scss:575-577`，这条 Web 端确实有，`schedule.scss:159-161`）误搬过来的。节奏条该透明，矩阵格子不该。

修复：删掉该规则。

### P1-5 顶栏纵向占用 181px，Web 移动端是 92px

| | 小程序 | Web ≤720px |
|---|---|---|
| 标题行 | paddingTop 51 + 44 = 95px | `.masthead { height: 50px }`（`chrome.scss:563-566`） |
| 工具行 | 44px | 无（控件都在同一行） |
| 月份轨 | 42px | 42px |
| 合计 | **181px** | **92px** |

两行式本身是为避让胶囊的合理取舍，但实现上多花了 20px：`.masthead` 的 `min-height:44px`（`web-ui.scss:213-219`）与 `paddingTop` 重复计算了高度。`paddingTop` 的作用只是把标题行推到胶囊中心，内容本身只有一行 24px 文字，再撑到 44px 就让第一行变成 95px。

按 390×844 屏算，181px 顶栏占 21.4%，首屏能看到的只有值班牌的上半部分；Web 移动端 92px 占 10.9%。

优化方向（不改交互语义）：
1. 去掉 `.masthead` 的 `min-height`，改为 `line-height` 撑高（省约 20px）。
2. `.masthead-tools` 与 `.rail` 合并成一行滚动条：月份切换器 + 月份轨本来都在切月份，两套控件并列是冗余的（Web 端也是 stepper 和 rail 并存，但 Web 的 stepper 在同一行里不额外占高）。合并可再省 44px。
3. 若保留两行，把 `.masthead-tools` 高度从 44px 收到 36px。

---

## 3. P2：尺寸偏离移动断点

### P2-1 日历格 46px / 13px，Web 移动端是 44px / 12px

| 属性 | Web `schedule.scss:624-631` | 小程序 `web-ui.scss:658-667` |
|---|---|---|
| `.cell` 高 | 44px | 46px |
| padding | 4px 5px 3px | 5px 6px 4px |
| `.cell .d` 字号 | 12px | 13px |

这组是连锁改动：小程序把日期字号从 12px 提到 13px，三行内容（13 + 2 + 9 + 10 = 34px）逼近 44-7=37px 的可用高度，于是把格子抬到 46px。根因是字号，不是高度。

按 Web 断点回退到 12px 后，44px 完全够用，日历能整体矮 2px、更接近 Web 的密度。

### P2-2 矩阵字号与间距偏离

| 属性 | Web ≤720px | 小程序 |
|---|---|---|
| `.gh` 字号 | 11px（`schedule.scss:663-666`） | 12px（`web-ui.scss:863-875`） |
| `.m-name` / `.mn` 字号 | 11px（`schedule.scss:658-661`） | 12px（`web-ui.scss:798-808`） |
| `.mn` padding-right | 6px | 8px |
| `.mn-head` / `.mr-head` 高 | 32px / 28px | 30px / 30px |
| `.tabs` 间距 | `gap: 14px`（`schedule.scss:641-643`） | `margin-left: 18px`（`web-ui.scss:759-766`） |
| `.tab` 字号 | 12px | 13px |

38px 宽的格子里放 12px 字号两字符（月/日）已经贴边，Web 用 11px 是有理由的。

---

## 4. P3：细节

| 项 | 位置 | 说明 |
|---|---|---|
| 节奏条尾部多 2px | `web-ui.scss:566-573` `.rhythm-bar { margin-right: 2px }` | 末位也带 margin，右侧比 Web 的 grid 多 2px 空隙 |
| `.cal-foot` 缺对齐 | `web-ui.scss:723-727` | Web 是 `space-between` + `gap:10px`（`schedule.scss:277-297`），小程序只有 `flex-wrap`，图例与标记行左对齐，且 `.legend-marks` 的 `flex-basis:100%` 换行策略没搬 |
| `.choice-row` 末列右边距 | `web-ui.scss:1063-1081` | 用 `margin: 0 6px 6px 0` 替代 `gap: 6px`，右边缘每列多 6px |

---

## 5. 两端共有、小程序更痛

### 5-1 矩阵触控目标 38×28px

`.m-body` 是 38×28px（`web-ui.scss:886-896`），远低于移动端 44×44 的最小触控建议，相邻格只隔 2px。Web 端在手机上同样小，但 Web 可以双指缩放、误触可撤销的路径更多；小程序里点错一个日期会直接弹出改班浮层。

可选缓解：矩阵格子改为 44×32px（横向滚动本来就必须，加宽不额外增加滚动成本），或把改班入口收敛到日历格，矩阵仅作只读展示（Web 的矩阵格也是可点的，需产品决策）。

### 5-2 `prefers-reduced-motion` 缺失

`web-ui.scss:620-621` 注释说明小程序不支持该媒体查询，所以 `calendar-in-next/prev`、`sheet-in`、`veil-in` 都无降级。属于能力限制，非缺陷，记录备查。

---

## 6. 建议修复顺序

1. **P0-1**（`.gh` 56px）：一行样式，修完「按姓名」才能用。
2. **P0-2**（hoverClass）：要动 8 处组件，但对「手感」的改善最大。
3. **P1-4**（休息格底色）：删 1 条规则，矩阵观感立刻回到 Web 水平。
4. **P1-2**（toast 定位）：改 1 个数值。
5. **P1-3**（竖线接缝）：补 1 条规则。
6. **P1-1**（全局 border-box）：加 1 条全局规则，但要回归 4 处控件尺寸。
7. **P1-5**（顶栏 181px）：改动面最大，建议单独一轮，先量真机再定。
8. P2 / P3 批量回归，逐项按 Web 断点对齐。

第 1-5 项合计改动很小，做完就能明显缩小与 Web 的观感差距。

---

## 7. 实机验证结果（2026-10-23 22:40）

环境：微信开发者工具（更新后的 Nightly）+ `miniprogram-automator` 0.13.0，模拟器 Huawei Mate 60，视口 390×844。
换算关系：Taro `designWidth: 375`，**实测 px = 设计 px × 390/375 ≈ ×1.04**，下表比对时已按此折算。

截图存于 `apps/miniapp/.automator/shots/`：

| 文件 | 内容 |
|---|---|
| `01-schedule-default.png` | 排班页首屏（顶栏 / 值班牌 / 日历） |
| `03-shift-editor.png` | 改班弹层 |
| `04-stats.png` | 统计页（加载态） |
| `05-matrix-shift.png` | 全员矩阵 · 按班次 |
| `06-matrix-by-name.png` | 全员矩阵 · 按姓名 |

### 7.1 被证实的

| 项 | 实测数据 | 结论 |
|---|---|---|
| **P0-1 按姓名视图错位** | 表头 `.gh` 每列 **39px**（left 101 / 140 / 179）；内容 `.m-body` 每列 **58px**（left 101 / 159 / 217） | **证实**。第 2 列偏 19px、第 3 列偏 38px，线性累积，第 30 列偏约 **551px**。`06-matrix-by-name.png` 里表头 20/21/22 与下方姓名块明显错开 |
| 按班次视图（对照） | `.gh` 步进 39px，`.m-body` 步进 39px | 对齐正常，说明问题只在 `is-by-name` 分支 |
| **P1-2 同步浮层定位** | `.masthead` 0~78.5；`.masthead-tools` 78.5~123.5；`.rail` 123.5~167；**toast `top: 99`** | **证实**。99 落在第二行控件区间内，触发同步时会盖住 `‹ 11月 ›` 与「同步 / 统计」 |
| **P1-5 顶栏过高** | 顶栏总高实测 **167px**（390×844，占 19.8%） | **证实**。此前按设计值估 181px 偏高，实测 167；Web ≤720px 为 92 设计px ≈ 96px，即小程序的 **1.74 倍** |
| P2-1 日历格 | `.cal-cell` 52×50，`.cell-face` 51×47 | 基本符合（折算后格高约 45，与报告的 46px 一致） |
| 矩阵格尺寸 | `.m-body` 39×29 | 折算 37.5×28，与设计一致，正常 |

### 7.2 被推翻的（静态审计误判，以实测为准）

| 项 | 原判断 | 实测 | 结论 |
|---|---|---|---|
| **P1-1 box-sizing** | 缺全局 `border-box`，4 处尺寸漂移 | `.hours-field` **95px**（若 content-box 应为 116）、`.shift-choice .shift-block` **35px**（应为 44）、`.m-body.is-name` **58px**（应为 61）、`.sheet-cancel` **93px** | **不成立**。实际就是 `border-box`，4 处尺寸全部正常。来源未查明（推测微信基础库或 Taro 注入了默认值），但结论明确：**这不是缺陷** |
| **P1-4 休息格丢底色** | `.m-body.is-blank` 把背景置透明，休息格变空白 | `05-matrix-shift.png` 里「休息」是**浅绿实心块 + 深绿字**，与 Web `.s-rest` 完全一致 | **不成立**。那条规则实际没有生效（或已被 `.s-rest` 覆盖），视觉效果与 Web 相同 |
| P1-3 矩阵竖线断开 | 每行断 2px | 截图分辨率下未能确认 | **降级为待确认**，需要 2x 截图才能判定 |

这两条推翻很有价值：`web-ui.scss` 里 `.m-body.is-blank` 这条规则**写了但不生效**，属于死代码，留着会误导后续维护者。

### 7.3 实测新发现

**弹层用固定 86vh，内容少时大片空白**

- 位置：`web-ui.scss:991-1001` `.sheet { height: 86vh }`
- Web 对照：`chrome.scss:160-166` 是 `max-height: calc(100vh - 32px)`（移动端 `max-height: 88vh`），高度随内容自适应
- 现象：`03-shift-editor.png` 里改班内容只占到屏幕约 2/3，下方近 1/3 全是空白
- 修法：`height: auto; max-height: 86vh`，`.sheet-body` 去掉 `flex: 1`

**统计页首屏是加载态**：`04-stats.png` 只显示「读取统计信息」，等云端数据返回后才有内容。这是正常状态，非缺陷，但说明统计页进入时必然有一次空白期，建议后续加骨架屏。

### 7.4 rerun 方式

```bat
cd D:\Dev\shift-schedule-miniapp\apps\miniapp\.automator
run.cmd
```

脚本链：`cli.bat auto --auto-port 9420` → `node capture.js ws://127.0.0.1:9420`。
**注意**：automator 必须用 `127.0.0.1` 而不是 `localhost`；且 `out/MiniProgram.js` 的版本校验已 patch
（原版对 `Tool.getInfo().SDKVersion` 为 undefined 时会崩），重装 automator 后需要重新 patch。

---

## 8. 修复记录（2026-10-23 22:45）

已修 4 项，全部在 `apps/miniapp/src/styles/web-ui.scss`，`pnpm verify:miniapp` 退出码 0。

| # | 改动 | 对应问题 |
|---|---|---|
| 1 | `.matrix.is-by-name` 内补 `.gh { width: 56px }` | P0-1 按姓名视图错位 |
| 2 | `.cloud-refresh-status` 由 `absolute; top:96px` 改为 `fixed` + 吸底 | P1-2 同步提示压控件 |
| 3 | `.sheet` 由 `height: 86vh` 改为 `height: auto; max-height: 86vh` | 弹层内容少时大片空白 |
| 4 | 删除 `.m-body.is-blank .shift-block` 死代码 | P1-4 误判的残留规则 |

### 复测结果（改后重跑实机截图）

| 项 | 改前 | 改后 |
|---|---|---|
| 按姓名：表头步进 / 内容步进 | 39px / 58px | **54px / 54px** |
| 按姓名：第 2 列 / 第 3 列偏差 | 19px / 38px | **0 / 0** |
| 同步提示位置 | `top: 99`（落在第二行控件内） | `top: 761`（吸底，屏高约 780） |
| 改班弹层 | 占满 86vh，下方近 1/3 空白 | 高度贴合内容，底部紧接按钮行 |

`06-matrix-by-name.png` 复测图里表头 20/21/22 与下方姓名块已完全对齐。

### 遗留未修

| 项 | 原因 |
|---|---|
| P1-5 顶栏 167px（Web 约 96px） | 要动两行式结构（第一行 `min-height:44px` 与 `paddingTop` 重复计高），改动面大，建议单独一轮并配合真机验证 |
| P1-3 姓名列竖线接缝 | 截图分辨率不足以确认，需要 2x 截图复核 |
| P0-2 零按压反馈 | 需要给 8 处组件加 `hoverClass`，属于交互层改动，未在本轮范围 |

### 顺带确认

`05-matrix-shift.png` 与 `06-matrix-by-name.png` 显示：休息格为浅绿实心块、日历三行文字不重叠、图例单行排布、
矩阵行距正常——这些此前的怀疑项实测均正常。

---

## 9. 视觉精修（第二轮，2026-10-23 22:55）

依据 `ui-ux-pro-max` 的三条硬规则：

| 规则 | 标准 | 改前 |
|---|---|---|
| Touch Target Size | iOS 44pt / Android 48dp | 矩阵格 37×28 |
| Active States | 按下必须有视觉变化 | 全应用零反馈 |
| Touch Spacing | 相邻触控目标 ≥8px | 矩阵邻格 2px |

另按 `pro-rules.md` 的 **Stable Interaction States**：按压态只改 `transform` / `opacity`，不改尺寸与边距，避免按下瞬间触发布局抖动。

### 9.1 按压反馈（新增基础设施）

小程序没有 `:active` / `:hover`，`View` 靠 `hoverClass` 属性在按下时追加类名（`Text` 不支持，两处 tab 已改为 `View` 包 `Text`）。统一定义 5 个语义类：

| 类 | 效果 | 用在 |
|---|---|---|
| `press-cell` | `scale(.94)` | 日历格 |
| `press-mb` | `scale(.9)` | 矩阵格（格子只有 38px，缩少了看不出来） |
| `press-dim` | `opacity .55` | 顶栏按钮、选项、弹层按钮、`.who` |
| `press-surface` | 淡墨底 | 月份切换器、人员列表项、返回 |
| `press-color` | 文字转墨色 | 月份轨、矩阵 tab、统计 tab |

过渡统一 140ms（`ds.$fast`），`hoverStartTime=0` / `hoverStayTime=90`，按下即亮、松手即灭。

覆盖：日历 35 格、矩阵 403 格、2 个 tab、8 个月份项、顶栏 4 个控件、改班层 8 类选项、人员列表、统计页 6 处。产物确认 **45 处 `hover-class`**。

### 9.2 触控与节奏

| 项 | 改前 | 改后 |
|---|---|---|
| 矩阵行高 | 28px | **32px**（±实测 29 → 31） |
| 矩阵色块高 | 25px | **28px** |
| 矩阵行间距 | 2px | **3px** |
| 日历格间距 | 3px | **4px** |
| 区块间距 | board 20 + cal-wrap 26 叠加 = 46px | **24px**（去掉重复叠加） |
| 日历→矩阵 | 30px | **28px** |
| 图例项间距 | 10 / 6px | **12 / 8px** |

间距收敛到 14 / 24 / 28 三档：页面左右 14，大区块之间 24，区块内子块之间 28。

### 9.3 复测

- `matrix m-body` 实测 37×31（改前 39×29），高度 +2
- 按姓名视图表头/内容步进仍为 54 / 54，**delta 0**（未回退 P0-1 的修复）
- 产物：`press-*` 5 类、`transition: transform .14s ease, ...` 均已编译进 `pages/index/index.wxss`
- `pnpm verify:miniapp` 退出码 0

### 9.4 本轮未动

| 项 | 原因 |
|---|---|
| 顶栏 167px 精简 | 需改两行式结构（stepper 并进月份轨），结构改动单独一轮 |
| 圆角 / 配色 / 字号层级 | 属于"纸面 + 墨牌"的设计基因（`r-data: 2px` 硬朗直角、班次色是语义数据色），不做擅自更改 |
| 统计页骨架屏 | 需加占位组件，非纯样式 |
