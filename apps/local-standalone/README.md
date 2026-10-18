# 倒班表 · 本地版（standalone）

一个**完全自包含**的纯本地静态页：不联网、不需要登录、没有账号和鉴权，
构建产物是一个可以整包拷到任何设备的静态文件夹。

## 与 `apps/web` 的关系

**没有依赖关系。** 本项目里的所有代码都是拷贝过来的独立副本：

- `src/core/` ← 拷贝自 `packages/core/src`（排班展开、统计、薪资、农历等纯逻辑），
  连测试一起拷了过来，所以 `pnpm test` 可以验证这份副本和原版行为一致。
- `src/features`、`src/components`、`src/styles` ← 拷贝自 `apps/web/src`。
- 删掉了登录页、注册、路由和全部 Supabase 代码。

不 `import` 原工作区的任何包（`@shift-schedule/core` 已替换成本项目内的
`@local/core` 路径别名，指向 `src/core/index.ts`），package.json 里也没有
任何 `workspace:*` 依赖。

## 命令

```bash
pnpm --filter shift-schedule-local dev        # 本地开发
pnpm --filter shift-schedule-local typecheck  # 类型检查
pnpm --filter shift-schedule-local test       # 跑拷贝过来的 core 测试
pnpm --filter shift-schedule-local build      # 产出 dist/ 静态包
```

也可以直接在本目录下 `pnpm dev` / `pnpm build`。

## 产物

构建输出到 `dist/`，是**单个自包含文件夹**：

```
dist/
├── index.html              入口
├── assets/app-*.js         全部逻辑（IIFE 单文件，无需联网）
├── assets/style-*.css      全部样式
├── icons/                  应用图标
├── manifest.webmanifest    PWA 清单（相对路径）
├── service-worker.js       安装后离线兜底
└── 使用说明.txt            随包附带的使用说明
```

因为它同时满足下面几点，所以**静态服务器托管**和**双击 `index.html`（`file://`）**
两种用法都能跑：

1. `base: './'` + 全相对路径，放到任意目录/子路径下都不会 404；
2. `format: 'iife'` + `inlineDynamicImports`，产出一个普通脚本，避开
   `file://` 下 ES module 被 CORS 拦截的问题；
3. `assetsInlineLimit` 拉满，JS/CSS 里引用的资源内联成 data URI；
4. 构建后把 `<script type="module" crossorigin>` 改写为 `<script defer>`。

## 视觉体系：与 Web 版共用一套

本应用**不使用**根目录 `DESIGN.md` 的 Web 规范，但**视觉层已与 `apps/web` 完全一致**
（2026-10 由「石墨仪表盘」整体替换）。完整说明见 **[`DESIGN-standalone.md`](./DESIGN-standalone.md)**。

一句话概括：**纸面底 + 墨色值班牌，班次用实色块，休息用浅绿块。**

- 版心 `.app-shell`，四层样式按 `tokens → chrome → schedule → stats → local` 级联；
- 深色值班牌（`.plaque`）回答「我现在上什么班、还有多久、这个月上了几天」；
- 左侧排班日历（点日期改班）+ 右侧 30 天全员矩阵（按班次 / 按姓名 两种行排序）；
- 统计页两个 tab：综合统计（月度概览 + 加班分布 + 薪资计算）、每日明细；
- 不加载任何网络字体，否则 `file://` 离线可用性会崩。

```
src/styles/
  tokens.scss     颜色 / 字阶 / 班次语义 / 版心 / 基础重置
  chrome.scss     顶栏 / 月轨 / 抽屉弹层 / 登录态
  schedule.scss   值班牌 / 排班日历 / 全员矩阵
  stats.scss      统计页（概览 / 柱图 / 薪资）
  local.scss      本地版专有覆盖（PC 可选中、窗口撑满）
```

### 与 Web 版有意不同的两处

| 差异 | Web | 本地版 |
|---|---|---|
| 文字可选中 | 全局禁选（移动优先） | `hover: hover and pointer: fine` 下放开，方便复制工时/金额 |
| 版心宽度 | `--page-max: 1560px`（居中，两侧留白） | `max-width: none`，窗口多宽就多宽（只留 24px 内边距） |
| 顶栏 | 跟随内容滚走 | 顶栏 + 月轨冻结（`.app-topbar { position: sticky }`）；统计页表头与 tab 同样冻结 |
| 滚动条 | 系统默认 | 隐藏（`html` / `.matrix-scroll` 都设 `scrollbar-width: none`），滚轮与触控板照常 |

### 关键结构决策

- **整月一屏。** ≥1440 起 30 列全部可见、无横向滚动（1440 下每列约 27px）；
  窄屏（≤1080）宁可横滚也把列宽守在 26px，避免把「白班」压成一团。
- **休息 = 浅绿块 + 文字。** 与日历、姓名药片同源（`--s-rest-cell`），三处一个颜色。
- **每行独立 grid。** 矩阵的行是 `.grid-row`（`grid-template-columns: 姓名列 repeat(30, …)`），
  表头与数据行必须逐列对齐 —— 有断言保护。
- **今天 = 2px 内阴影。** 不用 `outline`（画在盒外，落到小数像素就毛边）。

## 大屏（PC）优化

离线版主要在 PC 上用，矩阵列宽随断点走：

| 区间 | 矩阵列宽 | 侧栏（日历） |
|---|---|---|
| <=720 | 38px（横滚 30 列，进页面自动定位今天） | 堆叠 |
| 721-1080 | 26px（横滚） | 299px |
| 1081-1560 | `1fr`（30 列摊满） | 341px |
| >=1561 | `1fr`（窗口撑满后列更宽） | 341px |

`>=1440px` 起一屏可看完整月（实测横向溢出 0px，有硬性断言校验）。
`screenshot-dist.mjs` 会在 8 个分辨率下量布局并跑一批断言：
表头与数据行列对齐、班次标签不溢出单元格、日历内容不被裁、
`>=1920` 整月无横滚、大屏宽度利用率、PC 可选中 / 移动端不可选。

### 已知的取舍

- **PC 上放开 `user-select`**（`hover: hover and pointer: fine`），
  便于复制工时和金额；触摸设备保持禁选。控件本身在两端都禁选。
- **矩阵列宽在 1081–1560 是 `1fr`**，列宽会是 27.6px 这种小数；
  这是「整月一屏」的代价，视觉上靠 2px 整数描边和整数字号兜住。


## 数据

数据只存在当前浏览器当前站点的 localStorage 中，没有服务器、不会跨设备同步。
因此界面提供了「导出备份 / 导入备份」（JSON），用于换设备和防止清缓存丢数据。

如果浏览器禁用了 localStorage（隐私模式等），会自动退化为内存存储，
页面顶部会给出提示，此时刷新会丢数据。

## 视觉审计 / 回归工具

`scripts/screenshot-dist.mjs` 会在多个分辨率下真实打开产物、截图、量布局，
并跑一批硬性检查（表头与数据行列对齐、班次标签不溢出单元格、
日历单元格内容不被裁、≥1920 整月不横滚、大屏宽度利用率、PC 可选中 / 移动端不可选）：

```bash
node scripts/screenshot-dist.mjs
```

截图输出到 `screenshots/`（已在 `.gitignore` 里）。改样式之后重跑这个脚本，
就能直接看出大屏有没有退化。

> ⚠️ **两个回归脚本的选择器与 DOM 结构强耦合。**
> 改动 `ScheduleView` / `StatsView` / `AppChrome` 的类名时必须同步更新，
> 否则回归会静默失效 —— 历史上已经因此挂过两次。

## 本地模式下的权限

本地版把使用者视为管理员，所以人员切换器、团队统计对比图这些原本
只有管理员可见的功能全部保留可用。