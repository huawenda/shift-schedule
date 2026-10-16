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

## 视觉体系：石墨仪表盘

本应用**不使用**根目录 `DESIGN.md`（那条规范属于 `apps/web` 与 `apps/miniapp`）。
它有自己的一套，完整文档见 **[`DESIGN-standalone.md`](./DESIGN-standalone.md)**。

一句话概括：**是班次，就有色；是界面，就是无彩色。**
面板是冷石墨，班次色是背光格，界面层级只靠亮度和发丝线表达。
字体按语义分家 —— 中文用系统无衬线，**一切数字用系统等宽 + `tabular-nums`**，
这样金额和工时才能竖着对齐比较。

记忆点是**今天的游标**：一条 1px 发光白竖线贯穿表头和全部人员行，
日历里变成套住今天的一圈描边，改动某一格时闪一次。

样式层从 12 个级联文件收敛成 6 个：

```
src/styles/
  01-tokens.scss       颜色 / 字体 / 字阶 / 圆角 / 班次语义 / 重置 / 动效
  02-shell.scss        顶栏 / 汇总行 / 面板 / 控件 / 分段控件 / 空状态
  03-matrix.scss       排班表 / 日历 / 今天游标 / 图例
  04-stats.scss        统计页
  05-overlays.scss     弹层 / 字段 / 选择器
  06-responsive.scss   断点
```

构建产物的 CSS 从 79 kB 降到 **26 kB**（原来 12 个文件互相覆盖产生了大量冗余）。

### 关键结构决策

- **sticky 只剩顶栏 44px。** 原版在 1280 宽下 sticky 高 345px（占视口 43%），
  滚动时内容从底下穿过会被拦腰切断。
- **面板不拉伸。** 只有 13 行时撑满 1200px 高的显示器会得到空气行；
  stretch 之后面板内部会出现一大块空的面板，比留白更糟。
- **日历与排班表是同一矩阵的两种缩放** —— 日历格显示「日 + 农历 + 班次色条」，
  表格格显示「班次文字」。同一个格子几何，两种信息密度。
- **日历在左、排班表在右**（日历固定 320px，排班表吃掉剩余宽度）。
- **列宽下限 40px + `nowrap`** —— 格子里是 2~3 字标签，3 个汉字 × 12px = 36px。
  宁可横滚也绝不允许折行，折行会把行高撑高、整张表参差。
- **不加载任何网络字体**，否则 `file://` 离线可用性会崩。

---

## 大屏（PC）优化

离线版主要在 PC 上用。断点集中在 `src/styles/06-responsive.scss`，
尺寸用 CSS 变量（`--cell-w` / `--rail-w` / `--cell-h`）驱动。

| 区间 | 日期列 | 行高 | 侧栏 |
|---|---|---|---|
| <=767 | 40px | 28px | 堆叠 |
| 768-1023 | 40px | 28px | 堆叠 |
| 1024-1279 | 40px | 28px | 268px |
| 1280-1599 | 40px | 28px | 320px |
| 1600-2099 | 44px | 30px | 320px |
| >=2100 | 56px | 34px | 380px |

`>=1920px` 起一屏可看完整月（实测横向溢出 0px，有硬性断言校验）。
`screenshot-dist.mjs` 会在 8 个分辨率下量布局并跑一批断言：
表头与数据行列对齐、班次标签不溢出单元格、日历内容不被裁、
`>=1920` 整月无横滚、大屏宽度利用率、PC 可选中 / 移动端不可选。

### 已知的取舍

- **PC 上放开 `user-select`**（`hover: hover and pointer: fine`），
  便于复制工时和金额；触摸设备保持禁选。控件本身在两端都禁选。
- **姓名轨与数据行必须用显式 `flex-basis`**。用 `auto` 时行高 = grid 行高 + 边框，
  与姓名轨的 28px 逐行累积，13 行错位 13px。这个坑有断言保护。

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