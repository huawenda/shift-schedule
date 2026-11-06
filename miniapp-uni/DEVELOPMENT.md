# 小程序开发规则

这份文档只管 `miniapp-uni/`，视觉规范见 [DESIGN.md](DESIGN.md)，仓库级纪律见 [../AGENTS.md](../AGENTS.md)。

## 技术栈

- uni-app **Vue3** + Vite，产物是微信小程序（`dist/build/mp-weixin`），H5 仅用于预览。
- 不使用外部 UI 组件库（uni-ui / uView 等）。项目自建一套轻量控件：`styles/base.scss` 的公共 class + `components/` 的业务组件。
  这是刻意选择：视觉要和桌面端 1:1，不被第三方主题变量牵制。代价是**必须遵守下面的复用与 token 纪律**。

## 目录

| 目录 | 放什么 |
|---|---|
| `src/pages/` | 三个 tab 页：`overview` / `matrix` / `settings`，每个页面一个 `index.vue` + `style.scss` |
| `src/components/` | 跨页面复用的业务组件（见下表） |
| `src/composables/` | 组合式逻辑（如 `useCurrentShift`） |
| `src/data/` | 纯数据与规则：班次、结算月、统计、备份、农历、花名册命令/查询 |
| `src/store/` | 唯一状态入口 `roster.ts`，负责落盘与云端同步 |
| `src/utils/` | 平台测量等工具（`app-frame.ts`） |
| `src/styles/` | `tokens.scss`（变量）与 `base.scss`（全局基础层） |

新文件必须归位；不要把组件塞进 `pages/`，也不要把纯函数塞进 `components/`。

## 公共组件

| 组件 | 职责 |
|---|---|
| `nav-bar.vue` / `tab-bar.vue` | 外壳：顶栏月份胶囊、底栏三 tab |
| `today-plaque.vue` | 概览页值班牌 |
| `month-calendar.vue` / `todo-card.vue` | 月历、待办便笺 |
| `stats-panels.vue` | 四张统计卡 |
| `day-editor.vue` | 改班 + 加班 + 法定 + 事假 + 待办的贴底抽屉 |
| `pattern-grid.vue` | 24 格班序网格（只读预览 / 编辑共用） |
| `brand-card.vue` | 品牌卡与分享封面 |
| `settings-sheet.vue` | 设置页通用抽屉外壳（遮罩 / 标题 / 内容 / 底栏） |

规则：**同一展示形式出现 ≥ 2 次就必须封装**。设置页的抽屉一律走 `settings-sheet`，不要重新写遮罩和标题行。

## 样式纪律

1. 单位一律 `px`，不用 `rpx`；断点只取桌面 `≤639` 一档。
2. 颜色、字号、间距、圆角、阴影只能来自 [tokens.scss](src/styles/tokens.scss)：
   - 颜色：`var(--text)`、`var(--canvas)`、`var(--accent)`、`var(--danger)`、`var(--scrim)`…
   - 阴影：`var(--shadow-tight / raised / floating / overlay / sheet)`
   - 间距：`var(--sp-1…6)`；圆角：`var(--radius-mark / sub / control / card / panel / sheet)`
3. 页面与组件样式里禁止出现 `#xxxxxx`、`rgb()`、`rgba()`。
   唯一例外：`uni.showModal` 的 `confirmColor` 只能传字面色值，统一收敛成页面里的 `DANGER_MODAL_COLOR` 常量，并注明与 `--danger` 对齐。
4. 组件内部样式用 `<style scoped>`；页面级布局放 `pages/*/style.scss`，不要往 `base.scss` 里加业务样式。
5. 不要为一次性布局新增 token；现有 token 能表达就不加，新增要和现有风格同族。

## 外壳与数据

- 页面顺序固定：`nav-bar` → `.page > .canvas`（页头 → 内容）→ `tab-bar`。
- 页面滚动交给页面本身；矩阵、统计明细等局部滚动在组件内部处理。
- 所有读写走 `store/roster.ts`；页面不要直接改 `roster.overrides` 或拼 `memberId|date` 键。
- 业务口径（加班、法定、事假、统计、工资）只改 `src/data/`，页面只负责展示。

## 自查与验收

改完一块功能，先对照下面自查，再上报：

- [ ] 新元素是否用了公共组件或 `base.scss` 的 class？
- [ ] 有没有硬写颜色 / 阴影 / 间距？
- [ ] 目录归位了吗？有没有页面里复制一套重复结构？
- [ ] 空态、错误态、禁用态是否都覆盖？
- [ ] 是否破坏了外壳高度、底栏安全区或 sticky 表头？

命令：

```bash
pnpm -C miniapp-uni type-check
pnpm -C miniapp-uni build:mp-weixin
pnpm verify:miniapp-uni
```

模拟器不支持热重载，固定流程是「构建 → 全部清除 → 编译」：先 `pnpm -C miniapp-uni build:mp-weixin`，再在微信开发者工具「全部清除」（MCP `cleanAll`），最后刷新或重开项目窗口。顺序不可颠倒，否则改动不生效；新增组件还会报 `Component is not found`，只渲染插槽内容、抽屉外壳与样式整块丢失。「全部清除」只清缓存，不会清掉小程序本地数据。

根目录的业务口径由 `pnpm test`（vitest）覆盖；不要在小程序页面里重复写一套统计逻辑。
