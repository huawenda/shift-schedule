# apps/web UI 重设计方案

> 现状：`apps/web` 的界面是「蓝白 SaaS 卡片仪表盘」——`ui-ux-pro-max --design-system` 对「倒班表」这个题材给出的推荐配色恰好就是现在线上这套（`#2563EB` + `#F8FAFC`），说明当前视觉落在模板的默认值上，没有被这个题材本身推导过。
>
> 本方案从题材出发重做视觉与信息结构，不改数据层（`@shift-schedule/core`、`overrides`、Supabase 逻辑全部不动）。

---

## 0. 一句话方向

**把「卡片仪表盘」改成「值班牌 + 运行图」**：首屏回答"我现在上什么班、还有多久下班"，第二屏用一张**不横滚**的整月矩阵回答"谁哪天在岗"；**颜色只用来表示班次，界面本身保持无彩色**。

---

## 1. 现状审计（Chrome headless 实测，非估算）

| # | 问题 | 实测证据 |
| --- | --- | --- |
| 1 | **整月看不见**（核心功能失效） | 1440 视口下 30 天只显示 11 天；`.table-scroll` 可视 626px、内容 1800px → 需横滚约 3 屏 |
| 2 | 宽屏浪费且**仍要横滚** | 1920 下 `.app-shell` 仍是 1360px（左右各空 280px），可见 15/30 天，内容宽仍 1800px |
| 3 | 移动端退化为"缩小版桌面" | 390 下可见 6/30 天，矩阵需 1380px；摘要块高 36px、字号 15px（触控与字号双低） |
| 4 | 统计页是一张长表单 | 1440 下统计内容高 1717px（viewport 900 的 1.91 倍）；0h 的加班分布渲染成**三个 179×144 的空槽**（`0h` 标签 + 空柱） |
| 5 | 同一数据两种表示、无主次 | `.calendar-card`（562×431）与 `.schedule-card`（746×696）并列同等权重；桌面下单人日历占了 30% 宽度却与矩阵互为重复 |
| 6 | 半数是死块 | 6 个摘要块里「白特 / 夜特 / 事假」本月恒为 0，仍占整行一半（1920 下每块 217px 宽） |
| 7 | 颜色无法"扫视" | 6 个班次色全是浅底深字（`#dff3ff` / `#eee9ff` / `#dcfce7` / `#fff0c2` / `#fde7c7` / `#e5e7eb`），低饱和 + 同明度 → 在 13 行 × 30 列里看不出节奏 |
| 8 | 对比度不达标 | `--muted #65758b` 对 `--canvas #f5f7fb` = **4.38:1**；白特 `#b45309` 对 `#fff0c2` = **4.42:1**（AA 正文需 4.5:1） |
| 9 | 系统不成体系 | 5 档圆角（8/10/14/18/999）+ 3 档阴影 + 3 个 sticky；6 个容器出现 4 种圆角、3 种阴影 |
| 10 | 排版靠 OS 抽奖 | 无 `@font-face`、加载 0 个 webfont；栈首 `WeChat Sans Std` 本机未安装（只有 `msyh`）→ 落到微软雅黑；`font-variant-numeric: normal`，日期/小时数字不等宽，列不对齐 |
| 11 | 样式靠补丁维持 | 11 个 SCSS 层共 **1043 条规则**、12 个媒体查询只有 720/1024 两档；最后一层 `10-responsive-final.scss` 34.8KB（372 条规则） |
| 12 | 无暗色/主题 | 全仓无 `prefers-color-scheme`、无 `data-theme`；而对倒班人群，凌晨看表才是高频场景 |

> 结论：不是"不好看"，是**核心任务（一眼看完这个月）在三种屏幕上都做不成**，视觉只是这个结构问题的表象。

---

## 2. 场景与优先级（取舍依据）

| 场景 | 频率 | 需要 | 现在 |
| --- | --- | --- | --- |
| 上班中偷看手机 | 每天 2–3 次 | 今天/今晚什么班、几点下班、还有多久 | 要滑 4 屏才看到自己的班 |
| 月底核加班和工资 | 每月 1 次 | 汇总数字 + 明细可核 | 薪资是表单堆叠，缺"账单"感 |
| 管理员改某人某天 | 每周数次 | 精确点到某格、改完立刻看见 | 好用（`ShiftEditor` 保留） |

**优先级：① 此刻 ＞ ② 整月一眼 ＞ ③ 改单条。**

---

## 3. 三个方向

### A.「值班牌 / 运行图」✅ 推荐
深色"值班牌"回答此刻（班次、起止、倒计时、本月统计），下面接一条 30 格**节奏条**（班次色块，休息留空）+ 排班日历（编辑入口）+ **整月不横滚**的全员矩阵（桌面）/ **周切片**（移动）。界面无彩色，颜色只属于班次。

### B.「值班室」暗色控制台
整体深色、更密、更"操作台"，接近 `apps/local-standalone` 的既有风格。优点是两个 app 视觉统一、实现最省；缺点是等于把 `local-standalone` 的设计搬进云端版，且深色下大量浅色 pastel 班次色要重做一遍。

### C.「轻手账」移动优先卡片流
今日卡 + 周条 + 卡片列表，最保守、最像通用 App。实现最快，但辨识度最低——正是当前问题的延续。

| 维度 | A 值班牌 | B 值班室 | C 轻手账 |
| --- | --- | --- | --- |
| 辨识度 | 高（深色牌 + 无彩界面 + 节奏条） | 中高（与 local 重复） | 低 |
| 信息密度 | 高（1440 整月一屏） | 高 | 低 |
| 实现成本 | 中（~3.5 人日） | 中低（~2.5 人日） | 低（~1.5 人日） |
| 与 miniapp/local 一致 | 中等（共用色语义） | 高 | 高 |
| 主要风险 | 班次配色要从"浅底"改"实心块" | 两版同脸、白天可读性 | 解决不了横滚 |

---

## 4. 推荐方向的设计原则

1. **颜色只属于班次。** 按钮、选中、链接、图表轴线全部用墨色层次表达；界面上出现的每一块彩色都在说"这天是什么班"。
2. **首屏只回答一个问题。** 值班牌 = 班次名 + 起止时间 + 倒计时 + 进度。
3. **一个月必须能一眼看完。** 桌面 30 列零横滚；移动 7 列周切片（不横滚）。
4. **空白即休息。** 休息格里不写字（只留极浅底），上班的格子自然浮出来——"看见自己哪天要上班"。
5. **数字等宽，大字收紧字距、小字放宽字距。** `font-variant-numeric: tabular-nums` 全局；不用彩色做层次，用字距和字重。
6. **结构用线，不用影。** 1px 规则线 + 唯一一个深色块（值班牌）；阴影只留给浮层（抽屉/弹窗）。

---

## 5. Token

### 5.1 颜色

```css
:root {
  /* 基面：纸与墨（无彩） */
  --paper: #f4f4f0;        /* 画布 */
  --surface: #ffffff;      /* 仅浮层 */
  --ink: #14171a;          /* 主文字 / 值班牌底 / 主按钮 */
  --ink-2: #464c52;        /* 次文字   7.88:1 on paper */
  --ink-3: #62686e;        /* 辅助文字 5.11:1 on paper */
  --rule: #dcdcd5;         /* 分隔线 */
  --rule-strong: #bfc1b8;  /* 区段线 */

  /* 班次（唯一允许出现彩色之处） */
  --s-day: #e9a426;    --s-day-ink: #14171a;   /* 白班 8.40:1 */
  --s-night: #2e3a75;  --s-night-ink: #f3f2ec; /* 夜班 9.46:1 */
  --s-day-x: #92570a;  --s-day-x-ink: #ffffff; /* 白特 5.85:1 */
  --s-night-x: #1a2150;--s-night-x-ink: #ddd8ff;/* 夜特 11.14:1 */
  --s-rest: rgba(20,23,26,.055);               /* 休息：极浅底、不写字 */
  --s-leave: #e9e8e2;  --s-leave-ink: #5c6167; /* 事假 5.09:1 */
  --legal: #b3392e;                            /* 法定：小圆点/描边，不做填充 5.38:1 */
}
```

改造要点：**从"浅底深字"改为"实心块 + 反白字"**。原方案 6 个 pastel 在密集表格里同明度、同饱和度，无法扫视；实心块让"在岗"成为图形，颜色相位的间隔也更大（琥珀 ↔ 靛蓝，色相相差约 150°，比原来 `#02689f` ↔ `#5b21b6` 的窄相位更利于区分，也更友好于色觉障碍）。休息不写字，靠"缺席"表达。

### 5.2 字号阶梯

| Token | 值 | 用途 |
| --- | --- | --- |
| `--t-11` | 11px / 600 / +.16em | 标签（现在 / 距下班 / 本月） |
| `--t-12` | 12px / 500 | 矩阵日期头、姓名、副信息 |
| `--t-13` | 13px / 600 | 按钮、行内操作、日历数字 |
| `--t-15` | 15px / 400 | 正文（移动端最小正文） |
| `--t-22` | 22px / 700 / -.02em | 统计里的次级数字 |
| `--t-38` | 38px / 700 / -.02em | 倒计时 |
| `--t-56` | 56px / 800 / -.03em | 当前班次名（值班牌） |

字体栈保持 0 网络依赖（PWA/离线可用）：`-apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`，全局 `font-variant-numeric: tabular-nums`。**不引入 webfont**；若以后要更强的数字个性，再加一份 ~18KB 的数字子集（`unicode-range: U+0030-0039`）。

### 5.3 空间 / 形状 / 动效

```
间距: 4 / 8 / 12 / 16 / 24 / 32 / 48
页面: max-width 1560px，gutter 24（移动 14）
列宽: 矩阵 30 列 minmax(0,1fr)，姓名列 88（移动 70，周切片 7 列）
行高: 矩阵行 30，单元格块 26
圆角: --r-data 2px（数据面）/ --r-sheet 12px（抽屉、弹窗）/ 值班牌 0
阴影: 仅浮层 0 12px 32px rgba(15,23,42,.12)
动效: 150ms（hover）/ 220ms（月切换：节奏条横向擦除）/ 60s（倒计时重算）
      prefers-reduced-motion: 全部关掉，直接给末态
```

---

## 6. 逐屏方案

### 6.1 桌面排班（见 `desktop-1440.png`）

```
masthead 56   倒班表 · ‹10月› · 10/20–11/18 · 30天        已同步 · 华文达 4F · [统计] · 退出
month rail 46  5月 6月 7月 8月 9月 [10月] 11月 12月      ← 选中用 2px 墨色下划线，不用胶囊
─────────────────────────────────────────────────────────────
value plaque  现在 / 夜班 56px / 10-18 周日 20:00 → 次日 08:00 · 12 小时
  深色块      距下班 3 小时 12 分 38px + 2px 进度轨 + 当前位置刻线
              本月 ▮11 白班 ▮9 夜班 ▮10 休 · 农历九月初四 · 无加班
              ── 本月节奏 30 格（班次色块，休息留空，高 26）──
─────────────────────────────────────────────────────────────
board        344px                        1fr
             排班日历 7×5                全员排班 13 人 · 30 天      [按班次|按姓名]
             格 46px：日号 + 班次首字    姓名列 sticky 88 + 30 列 minmax(0,1fr)
             底栏图例 7 项               每 7 列一条 1px 分组线；本周行 2px 左侧墨条
             点格 → 改班抽屉             整月零横滚；今天列 inset 2px 上边线
```

尺寸校验：`1560 − 48(padding) − 344 − 36(gap) − 88 = 1044` ÷ 30 = **34.8px/列**；1280 下为 27.6px（此时切"两周密度"）。

### 6.2 移动排班（见 `mobile-390.png`）

- masthead 压到 50px：`倒班表 · ‹10月›` + 右侧 `华文达 [统计]`（同步/退出收进"我"菜单）。
- 值班牌纵向三段：班次 40px → 倒计时 30px → 本月（11 白 · 9 夜 · 10 休）。
- 节奏条 18px 高，仍 30 格（一格 ≈ 11.5px，纯示意，不点）。
- 日历整宽，格 44px（触控最小 44）。
- 全员矩阵 → **周切片**：`第 1 周 10/20–10/26  ‹ ›`，姓名 70px + 7 列，纵向 13 人，无横滚。
- 改班仍用底部抽屉；`useBackDismiss` 保留。

### 6.3 统计页 → "账单"

去掉现在 `stats-personal-track`（两页横向 50% 平移 + 分页点），改竖向三区：

1. **概览条**：白 11 / 夜 9 / 休 10 / 加班 0h —— 一行 4 个数字，下方一条**横向分段条**按比例着色（替代三根空槽柱）。
2. **加班分布**：水平分段条 + 右侧数字；值为 0 时显示 `—` 而不是空柱（现在 0h 会画出 179×144 的空槽）。
3. **每日明细**：`日期 · 星期 · 班次块 · 小时`，行高 32，班次块与矩阵同一套色，可直接点进改班。
4. **薪资**：做成"工资条"——右对齐等宽数字、区段细线、小计在右、合计最后一栏加粗加 2px 上框线；输入框只在"可编辑"时描边可见。

### 6.4 覆盖层

- 顶部那条「当前未配置 Supabase…」蓝色横幅 → 收成 masthead 里的一个状态点（`● 演示模式`，hover/点击展开 1 行说明）。它现在在每屏顶部吃掉 40px 且不可关闭。
- 改班抽屉：`白班 / 夜班 / 休息 / 白特 / 夜特 / 事假` 六宫格（44px 高）+ 加班小时步进器 + 法定开关 + 保存；桌面居中 480px，移动底部抽屉。
- 空态/错误：一行说明 + 一个主操作 + 重试，不用插图。

---

## 7. 代码改造映射（文件级）

| 动作 | 目标 |
| --- | --- |
| 改 | `styles/01-foundation.scss` → `styles/tokens.css`（只留变量 + reset + 字体） |
| 合并 | `02-app-shell` + `04-overlays-auth` → `shell.css` |
| 合并 | `03-schedule` + `06-schedule-corrections` + `08-miniapp-schedule` → `schedule-board.css`（目标 < 150 条规则） |
| 重写 | `09-stats.scss` → `stats.css`（账单布局，目标 < 120 条） |
| **删** | `10-responsive-final.scss`（34.8KB / 372 条）——断点回到各组件内部，只保留 720 与 1280 两档 |
| 拆 | `features/schedule/ScheduleView.tsx`（355 行）→ `AppChrome` / `ShiftPlaque` / `RhythmStrip` / `MonthCalendar` / `TeamMatrix` / `WeekSlice` / `ScheduleView`（组合） |
| 拆 | `features/stats/StatsView.tsx` → `StatsHeader` / `OverviewBar` / `OvertimeSplit` / `DailyList` / `SalarySlip` |
| 新增 | `hooks/useCurrentShift.ts`（按 08:00/20:00 与 `scheduleData` 推断当前班次、起止、剩余分钟，60s tick） |
| 新增 | `hooks/useWeekSlice.ts`（移动端周切片索引，默认定位"包含今天"的那一周） |
| 保留 | `services/*`、`hooks/useBackDismiss`、`ShiftEditor` 的业务逻辑、`@shift-schedule/core` 全部 |

---

## 8. 分阶段与验收

| 阶段 | 内容 | 工时 | 验收 |
| --- | --- | --- | --- |
| P0 | tokens + 字体 + masthead/month rail + 页面骨架 | 0.5d | 与 mock 截图逐像素对齐（±4px） |
| P1 | 值班牌 + 节奏条 + 日历 + 矩阵（桌面）/ 周切片（移动） | 1.5d | 1440 与 390 均**零横滚**；触控 ≥44px；`useCurrentShift` 跨零点正确 |
| P2 | 统计三区 + 工资条 | 1d | 0 值不画柱；数字右对齐；1717px → 目标 ≤1100px |
| P3 | 动效、空态、错误、键盘 focus、对比度复查 | 0.5d | 全部文字 ≥4.5:1；`prefers-reduced-motion` 生效 |

合计 **≈3.5 人日**（不含真实数据联调与美术走查）。

---

## 9. 风险与取舍

1. **班次配色的语义迁移**：白班从"蓝"变"琥珀"，老用户要一次适应。缓解：`ShiftEditor` 里保留文字标签，图例永远在矩阵下方；若你希望更保守，也可只改"实心块 + 休息留白"，保留原蓝/紫/绿色相（方案 A′，成本不变）。
2. **30 列在 1280 变成 27.6px**：字号会压到 10px，低于可读下限。备用方案：1280 以下自动切"两周密度"（15 列 × 两段），仍不横滚。
3. **深色值班牌在强光下**：牌内白字对 `#14171a` 为 16.3:1，安全；但要避免把表格也做深色（现在是浅色表格 + 深色牌，反差正好充当"今天"的锚点）。
4. **暗色主题**：本方案先把"纸"做成中性灰白，后续加 `[data-theme=dark]` 时只需换 6 个基面 token，班次色不变（实心块在深色底同样成立）——这是选实心块而不是浅底的额外收益。
5. **不引入 webfont**：保持离线/PWA 零请求，代价是数字个性弱一些；这是刻意的取舍。

---

## 10. 需要你决定

1. 方向选 **A / A′(保留原色相) / B / C**？
2. 日历是否保留？（建议保留，但降级为"编辑入口"，桌面窄栏、移动整宽）
3. 移动端矩阵用**周切片**（推荐）还是保持 30 列横滚？
4. `miniapp`（Taro）是否跟进同一套 token？如果要，我把 token 抽成 `@shift-schedule/design-tokens` 包，三端共用。

---

### 附：本方案的产出物

- `schedule-mock.html` —— 可交互静态稿（无依赖，双击打开；桌面/移动用同一份，宽 720px 以下自动切周切片）
- `desktop-1440.png` / `wide-1920.png` / `mobile-390.png` —— 三档截图
- `before-1440-schedule.png` / `before-1440-stats.png` —— 改造前对照

---

## 11. 实施记录（2026-10-18 已落地）

拍板结果（对应上面 §10 的四问）：**方案 A · 保留日历 · 移动端 30 列横滚（不做周切片）· 只改 web 端**。

### 11.1 实际改动

| 文件 | 动作 |
| --- | --- |
| `apps/web/src/styles/{tokens,chrome,schedule,stats}.scss` | 新建 4 层，替换原 `01-foundation.scss`…`11-auth-page.scss` 11 层（约 104KB → 约 60KB） |
| `apps/web/src/appConstants.ts` | 新增 `shiftWindows`（白/白特 08:00 起 12h、夜/夜特 20:00 起 12h —— 数据层没有时刻，这是唯一假设点）、`shiftInitial`、`weekdayLabels`、`formatShortDate` |
| `apps/web/src/hooks/useCurrentShift.ts` | 新建：`active / upcoming / idle` 三态 + 倒计时 + 进度，30s tick，夜班按次日结束 |
| `apps/web/src/components/ShiftMark.tsx` | 新建：班次实心块（休息不渲染文字） |
| `apps/web/src/components/AppChrome.tsx` | 重写：`masthead` + 12 月 `rail`，`h1` 为品牌名 |
| `apps/web/src/features/schedule/{ShiftPlaque,MonthCalendar,TeamMatrix,ScheduleView}.tsx` | 重写 / 新建：值班牌 + 节奏条 + 日历 + 全员矩阵 |
| `apps/web/src/features/schedule/ShiftEditorModal.tsx`、`features/auth/AuthPanel.tsx`、`features/stats/StatsView.tsx` | 按新 token 与版式重写（逻辑、props 契约不变） |
| `apps/web/src/App.tsx` | 去掉 `chrome` 节点传递、`AppChrome` 直接由 `ScheduleView` 渲染；新增 `calendarCells` memo |

### 11.2 与方案的偏差

1. **移动端保持 30 列横滚**（按你的决定），未做周切片；`.matrix-scroll` 进入时自动把「今天」滚到可视区第二列。
2. **矩阵两种视图保持「行=姓名、列=日期」**（不做转置）：
   - `按班次`：格子里是实心班次块，**文字横排**（原方案里竖排两字，已按你的要求改正）；
   - `按姓名`：身份列只显示班组（4F…4X），格子里是**姓名药片**，药片底色仍表示班次 —— 与原版 web 的「姓名」视图一致；两视图列宽不同（班次 30px/姓名 56px），窄屏各自横滚。
3. **统计页把原来的两页横滑（个人/每日）改成 tab 切换**，并保留 admin 的「全员统计」为第三个 tab；薪资区由 2 列改 3 列，`实付工资` 仍占满宽。**月度概览不再叠两条线**：`.ovw` 的 `border-top` 已删，只留 `.sec-head` 的下划线（原先两条相距 9px，看着像一条毛边粗线）。**柱图基线与左列表格底线同一条线**：`.zones { align-items: stretch }` + `.zones > section { display:flex; flex-direction:column }`，`.bars { margin-top:auto; justify-content:flex-end; flex:1 1 auto }` 沉底，`.bars-plot { flex:1 1 auto; min-height:118px }` 吃掉剩余高度；关键是两个「页脚」等高——左列 `本月加班合计` 行 40px，右列 `.bars-axis` 用 `margin-top:8px + padding-bottom:16px` 也凑成 40px，于是 `tableBottom = plotBottom = 580`（差 0）。空数据时 `.bars-empty { margin-block:auto }` 垂直居中。
4. **色块是真正的独立药片**：`.m-body`（单元格按钮）本身不再带班次底色，只有内部 `.shift-block` 上色（`height: 27px`），配合 `.grid-row { column-gap: 3px }` 与 30px 行高，横竖都是 3px 纸色缝。首版把班次类名同时贴在按钮上，按钮底色（30px 满高）把竖向缝隙填掉了，所以同班次上下会粘成一条——这是「单独色块没生效」的真正原因。**矩阵不画周分隔线**（`.week-start` 与其 `border-left` 已删）。
5. **未引入 webfont**：本机只有微软雅黑（`msyh.ttc`），Web 端沿用系统字体栈，靠字重/字号/字距建立层级。
6. **修掉「日历里改班不生效」**：`App.tsx` 的 `calendarCells` memo 早先只依赖 `[selectedMonth, name]`，保存后不会重算；现在把 `overrides.shiftOverrides` 纳入依赖，并逐格用 `getOverrideKey(name, cell.key)` 覆盖 `cell.shift`，日历格、矩阵、值班牌计数、节奏条一次性同步。
7. **休息色只有一个来源**：`.s-rest { background: var(--s-rest-cell); color: var(--s-rest-ink) }`，`--s-rest-cell: #c9d7c3` + `--s-rest-ink: #3f5b47`（对比 4.9:1）。**排班日历的休息格、按班次矩阵的休息块、按姓名视图的休息药片、图例色块四处同源**，改一处四处一起变。休息不再是「留白」：日历格写 `休`，矩阵块写 `休息`（`ShiftMark` 不再跳过休息）。
8. **矩阵内容居中对齐 + 药片缝一致**：`.m-body { justify-content: center }`，姓名药片中心与日期表头中心实测完全重合（`headCx === pillCx`）；`.name-pill { width: 100%; height: 27px }` 让药片吃满格子，配合 `column-gap: 3px` 与 30px 行高，横竖缝实测都是 **3px**（改前横向 13px、纵向 6px）。
9. **抗锯齿 P0（2026-10-18 晚）**：用户反馈「当天标记框锯齿 + 字体锯齿」。诊断见 `.tmp-shots` 实测：DPR 1、日历列宽 `47.4219px`、当天格 `y=677.3125`、`document.fonts.size===0`、`text-rendering: optimizeLegibility` 且 `-webkit-font-smoothing: antialiased`（Windows 无效）。落地四项：
   - `tokens.scss` 删掉 `text-rendering: optimizeLegibility`（中文合成字重下会更糊）；
   - 26 处 `font-weight: 600` 全改 `700`（雅黑只有 400/700，600 是浏览器合成假粗体）；
   - 当天标记从 `outline: 2px + outline-offset: 1px`（画在盒外、落到小数坐标就毛边）改为 `box-shadow: inset 0 0 0 2px var(--ink)`，节奏条同日标记同样改 inset；
   - 主要文字块补整数行高（`.brand 25px`、`.p-label 16px`、`.tally span 16px / b 28px`、`.legend span 16px`、`.matrix-title 22px` 等）。
   - 仍残留：页面起点 `.dev-strip` 高 31.938px 等小数，导致区块整体带 0.19–0.94px 的偏移——彻底消除需要把每个字号/行高配成整数、再把日历列宽整型化（P2），本轮未做。

### 11.3 实测数据（1440×900，Chrome headless）

| 指标 | 改造前 | 现在 |
| --- | --- | --- |
| `/schedule` 文档高 | 1132px | 1000px |
| `/stats` 文档高 | 1717px | 985px |
| 30 天在 1440 是否可见 | 11/30（需横滚 1800px） | 30/30（零横滚） |
| 摘要色块 | 6 个等宽块 | 值班牌内 3 个计数 + 节奏条 |
| 最小文字对比度 | 4.38:1（`--muted`） | 5.09:1（`--ink-3`），班次块 ≥5.85:1 |
| 容器圆角种类 | 4 种 + 3 种阴影 | 数据 2px / 弹层 12px 两档 |
| 移动 `/schedule` | 表格仅 6/30 列可见、无 sticky | sticky 姓名列 + 30 列横滚 + 自动定位今天 |

### 11.4 复验方式

```bash
pnpm --filter @shift-schedule/web run typecheck
pnpm build:web
# 演示数据（不连 Supabase）：
$env:VITE_SUPABASE_URL=''; $env:VITE_SUPABASE_ANON_KEY=''
pnpm --filter @shift-schedule/web exec vite --host 127.0.0.1 --port 6199
```

截图（`after-*.png` 即本轮实机结果）：`docs/web-redesign/after-1440-schedule.png`、`after-1440-name-view.png`、`after-1440-calendar-edit.png`、`after-1440-calendar-rest-zoom.png`、`after-1440-cell-gap-zoom.png`、`after-1440-stats.png`、`after-1920-schedule.png`、`after-390-schedule.png`、`after-390-stats.png`。

### 11.5 已知待办

- 班次时刻（`shiftWindows`）取自假设，需要你确认真实的上下班时间。
- 管理员身份来自 `profile.isAdmin`，演示模式下无 profile，因此「切换用户 / 全员统计」在 demo 里不可见，需连真实 Supabase 复验。
- 深色主题未做，但 token 已按「只换 6 个基面」的方式组织。

