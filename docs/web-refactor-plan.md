# 昼夜 · Web 前端重构方案（引入 shadcn/ui）

> 状态：**方案文档，未实施**。本文只描述计划，主项目代码一行未改。
> 依据：2026-11-08 与用户逐条对齐的决策，以及 `shadcn-lab/` 沙盒中已验证的技术结论。
> 真相顺序：本文 > README.md / DESIGN.md 中的旧约束（重构完成后需同步修订规范文档）。

---

## 0. 一句话

把 web 前端从「React 18 + Vite 4 + 自绘 SCSS」升级到「React 19 + Vite 5.4 + Tailwind v4 + shadcn/ui」
（技术栈最小升级档：只动 Vite、React 与 Node 基线；TS 与 vitest 保留），
用 shadcn 接管通用外壳与交互控件，
自研组件继续使用项目 token；外壳整体换成默认风格，
三个复杂自研组件（全员矩阵 / 个人月历 / 值班牌）全程不动，最后才做样式对齐。

---

## 0.1 实施进度（滚动更新）

| 阶段 | 状态 | 时间 | 结果 |
|---|---|---|---|
| 0 · 基线 | ✅ 完成 | 11-08 19:33 | HEAD `f2008c2`；build 89 modules / CSS 78.25 kB / JS 935.13 kB；test **14 文件 271 例**全通过（README §9 的「223 例 / 11 文件」已过时，阶段 6 一并更正） |
| 1 · 技术栈 | ✅ 完成 | 11-08 19:37 | Vite 5.4.21 + React 19.3.1 + `@types` 19 + Tailwind v4；根与 `desktop/` 两份配置均补插件与 alias；`tsc --noEmit` 通过；93 modules / CSS 89.56 kB / JS 1013.64 kB；desktop 构建通过；产物仍是 `<script defer>` 单文件，`modulepreload` 已清除 |
| 2 · Token 与 SCSS 共存 | ✅ 完成 | 11-08 19:39 | 新增 `--ui-*` 32 个 + `.dark` 31 个 + `@theme inline` 38 条映射（D16）；`tokens.scss` 原样未动；CSS 89.56 → 93.27 kB；实测 `.bg-primary{background-color:var(--ui-primary)}`，项目变量 `--accent:#1b6c80` 等全部保持原值；271 例通过 |
| 3 · 外壳 | ✅ 完成 | 11-08 19:57 | 新增 `AppShell / AppSidebar / TopBar`，删 `Shell.tsx`；`shell.scss` 899 → 299 行（深青外框、侧栏、顶栏、画布浮层全部删除，只留 `.canvas*` / `.segmented*` / 滚动条）；补回 preflight 的边框部分（D17）；2252 modules / CSS 119.93 kB / JS 1144.14 kB；271 例通过；desktop 构建通过 |
| 4 · 通用控件 | ✅ 完成 | 11-08 21:56 | **Select**（269 行自绘 → shadcn `Select`，对外 API 不变，空串哨兵值转换）、**Toast**（sonner 适配层，删 `ToastHost.tsx` + `toasts.scss` 约 450 行）、**Dialog**（7 个弹层全部换 Radix，删 `useDialogFocus` 与 `.sheet-backdrop`/`.dialog` 面板 CSS 约 190 行）、**Tabs**（设置页分页）、**Table**（每日明细，含 sticky 与关掉官方容器 overflow）、**Input**（全部 11 处，含弹层内 6 处；`type=number` 的步进箭头已用 `appearance` 去掉）、**Popover**（矩阵概览条「查看名单」：自绘浮层 → shadcn `Popover`，Esc / 点外部关闭 / 焦点归位交给 Radix） |
| 5 · 自研简单组件 | ✅ 完成 | 11-08 22:30 | 四块统计与待办卡统一成**自研外壳**（`.card-surface`：白底 + `1px var(--border)` + `--radius-panel`，无投影）；**不引入 shadcn `Card`**——实测其 `ring-1 ring-foreground/10` 在本项目主题层下解析为 `oklch(0.708 0 0 / 0)`（alpha 0）；待办项改为 `label + input[type=checkbox]`（整行可点、`accent-color` 上色）；**死样式清理**：`.input*` / `.select-*` / `.dialog-actions*` / `.dialog-narrow` / `.profile-block|tag|title` 等约 25 条规则，CSS 181.4 → 179.0 kB；**成员表保留 grid、只调视觉**（用户 22:01 定）：行高 40px 对齐 h-8 控件、`--ui-border` 分隔线、表头 `font-weight:500` + muted、本人行与悬停用中性 `color-mix`、只读字段 30→32px 与 Input 齐平、分组 tab 改 shadcn 胶囊式、设置页卡片外壳统一为 1px 线 + 无投影 |
| 6 · 文档与验收 | 🔄 进行中 | 11-08 22:45 | 文档已同步：README（外壳、目录树、测试数 223→271、视觉体系）与 DESIGN（视觉基调、结构、版心公式、路由表）；**待做**：`verify:dist` 412 项 CDP 断言实机跑一遍（Dialog Portal 后 DOM 定位需改，按规则需用户指令） |
| 7 · 最后调三个复杂组件 | ⏳ | — | — |

> 阶段 1 的两个实施决策（已并入 §3.5 / §7 R1）：
> 1. **不导入 preflight** — 避免全局重置与 7 层 SCSS 叠加造成视觉回归，等组件迁移完再评估
> 2. **`@source` 限定扫描范围** — 排除 `shadcn-lab/` 与两份产物目录，CSS 从 132.63 kB 降到 89.56 kB

---

## 1. 目标与范围

### 1.1 目标

| 目标 | 判定 |
|---|---|
| 引入的 shadcn 组件全部使用**默认 token** | 不改 `:root` / `.dark` / `@theme inline` 的默认值，不覆盖 `--sidebar*` |
| 自研组件使用**项目 token** | `tokens.scss` 重写为指向 shadcn 变量的别名层 |
| 整体视觉贴近 **shadcn 默认** | 采用方案 A：深青 L 形外框整套撤掉 |
| 只做前端、不接业务逻辑 | `src/data/`、备份 v5、存储层、271 单测零改动 |

### 1.2 范围内（允许改）

- `src/`：组件、样式、`App.tsx`、入口
- 根 `vite.config.ts`、`index.html`、`tsconfig.json`、`package.json`
- `desktop/vite.config.ts`：**只补** `@tailwindcss/vite` 插件与 `@` alias（见 §1.4）
- `scripts/verify-dist.mjs`（DOM 定位随 Portal 变化）
- `AGENTS.md` / `DESIGN.md` / `README.md`（规范与文档同步）

### 1.3 范围外（明确不动）

| 范围 | 说明 |
|---|---|
| `desktop/src-tauri/` | Rust 壳、`paint_caption` 标题栏染色、托盘、单实例一律不管 |
| `tauri.conf.json` / NSIS 打包 | 不管 |
| `miniapp-uni/` | 不管 |
| `src/data/`、备份 v5、`src/platform/`（`storage` / `rosterStore` / `download` / `env` / `backupDir` / `windowPrefs`） | 纯规则与持久化，不受 UI 重构影响 |
| 271 个 vitest 用例 | 断言的都是数据层规则，不应因换 UI 改动 |

### 1.4 `desktop/vite.config.ts` 的处理（已定，原 Q1）

它是**另一份吃同一份 `src/` 源码**的独立构建配置（自行 `defineConfig`、`appRoot` 指向上一级）。
重构后 `src/` 里会出现 `@/components/ui/*` 的 import 与 `@import "tailwindcss"`，
若这份配置不补，桌面产物**在构建期**就会挂（alias 解析失败、Tailwind 指令无人处理）。

**结论：纳入本次范围，但只补两项**——`@tailwindcss/vite` 插件与 `@` alias。
Rust 壳、`tauri.conf.json`、NSIS 打包、`stripPwaAssetsPlugin` 一律不动。

---

## 2. 现状基线（2026-11-08 实测）

| 项 | 现状 |
|---|---|
| 运行时 | Node ≥18（`engines`），实际 v22.22.2 / pnpm 11.28.6 |
| 前端 | React 18.3.1、Vite 4.5.14、TypeScript 5.9.3、vitest 0.34.6、sass 1.95.1 |
| 组件 | `src/components/*.tsx` 18 个，`src/screens/*.tsx` 4 个，`SettingsScreen.tsx` 759 行 |
| 样式 | `src/styles/*.scss` 共 6377 行；`tokens.scss` 662 行；入口 `styles.scss` 按 7 层 `@use` |
| 令牌 | 通用语义（`--chrome*` / `--surface*` / `--border*` / `--accent*`）、尺寸（`--radius-*` / `--sp-1~6` / `--fs-*` / `--control-height: 30px`）、业务数据色（`--shift-*-bg/ink` / `--pay-*` / `--todo-tone-*`） |
| 构建产物 | `base:'./'` + IIFE 单文件 + `assetsInlineLimit` 拉满 + 手写插件改写 `<script>`，`file://` 双击可用 |
| 验收 | `pnpm build`（guides + tsc + vite build）、`pnpm test`（271 例）、`pnpm verify:dist`（README §9 记 412 项 CDP 断言；脚本 3329 行、248 个 `check()/assert()` 调用点，其余由循环展开） |
| 桌面 | `desktop/vite.config.ts` 独立，另有 `stripPwaAssetsPlugin` |
| 视觉 | framed-sheet：深青 L 形外框 `#0e2228` + 228px 侧栏 + 48px 顶栏 + 白色画布 inset 8 / 圆角 16 / 低位投影；1466×900 基准 |
| pnpm 白名单 | 根 `pnpm-workspace.yaml` 的 `allowBuilds` 目前只放行 `esbuild` 与 `@parcel/watcher` |

> ⚠️ Node 版本：shadcn CLI 4.23 要求 `node >=20.18.1`，`@tailwindcss/oxide` 要求 `>=20`。
> 实测本机 v22.22.2 满足，但 `package.json` 的 `engines.node: ">=18"` 需上调；
> Tailwind v4 的原生二进制需加进 `pnpm-workspace.yaml` 的 `allowBuilds`，否则装得上但构建时找不到模块。

### 2.1 技术栈决策：最小升级档（用户 19:15 选「A」，19:25 补入 React 19）

> 与 §3.1 的「外壳方案 A」是两处独立编号，下文统一称「最小升级档」以免混淆。

**结论：要升两处——Vite → 5.4、React → 19；TypeScript 与 vitest 保留。**

React 必须一起升，原因不是追新：沙盒 17 个 `ui/*.tsx` **全部不使用 `forwardRef`**，
采用 React 19 的 ref-as-prop 写法（`...props` 直接展开给底层元素，`ref` 混在 props 里）。
在 React 18 下 `ref` 会被 React 从 props 剥离，`asChild` 场景（`DialogTrigger` / `PopoverTrigger` /
`SelectTrigger`）拿不到 DOM 节点，Radix 的定位与焦点管理会**静默失效**——类型不报错，运行时才出问题。

主项目升 React 19 的成本已实测很低：`defaultProps` 0 处、`propTypes` 0 处、`ReactDOM.render` 0 处、
`forwardRef` 0 处，入口已是 `react-dom/client` + `createRoot`（19 完全兼容）。

| 依赖 | 现状 | 重构后 | 依据（实测） |
|---|---|---|---|
| Vite | 4.5.14 | **^5.4.21**（最低 5.2） | `@tailwindcss/vite@4.3.5` peer = `vite ^5.2.0 \|\| ^6 \|\| ^7 \|\| ^8`，Vite 4 不满足 |
| React / react-dom | 18.3.1 | **^19.3.1** | 沙盒 17 个组件全无 `forwardRef`，依赖 ref-as-prop；主项目无 React 19 移除的 API |
| `@types/react` / `@types/react-dom` | 18.3.x | **^19.3.0** | 跟随 React 19 |
| TypeScript | 5.9.3 | **保留** | `@types/react@19` 要求 TS ≥5.0；shadcn 组件是普通 TSX，无需 TS 7 |
| vitest | 0.34.6 | **保留** | 内置 `vite` 依赖范围 `^3 \|\| ^4 \|\| ^5.0.0-0`，与 Vite 5 兼容；不依赖 React 版本 |
| `engines.node` | >=18 | **>=20.18.1** | shadcn CLI / `@tailwindcss/oxide` 要求 |
| `allowBuilds` | esbuild / @parcel/watcher | **+ `@tailwindcss/oxide`** | Tailwind v4 原生二进制 |
| 新增 | — | Tailwind v4 + `@tailwindcss/vite`、shadcn CLI、`radix-ui`、`cva`、`cn`、`lucide-react`、`sonner`、`next-themes`、`tw-animate-css`、`@fontsource-variable/geist` | 见附录 B |
| 不引入 | — | `@vitejs/plugin-react` | 主项目 `vite.config.ts` 只有两个自定义插件，JSX 由 esbuild 处理，非必需 |

**未采纳的两档**：

- 零 Vite 升级档：改用 `@tailwindcss/postcss`（实测无 peer / 无 engines 约束）保留 Vite 4；
  属非官方路径，shadcn 文档与 CLI 模板按 `@tailwindcss/vite` 写，踩坑资料少。
- 全升档：Vite 8 + TS 7 + vitest 3；`@vitejs/plugin-react@6` 强制 `vite ^8`、
  TS 7 破坏性变更、vitest 必须升，成本最高且无收益。

沙盒 `shadcn-lab/` 用的是 create-vite 脚手架默认的最新组合，仅作为组件与 token 的验证环境，
**不作为本次目标栈**。

---

## 3. 目标架构

### 3.1 外壳（方案 A，已确认）

撤掉深青 L 形外框、228px 侧栏、48px 顶栏、白色画布浮层、Tauri 标题栏染色，
改为沙盒验证过的结构：

```
SidebarProvider
├── Sidebar（默认 `--sidebar*` token，浅色侧栏）
│   └── Header / Content / Footer / Rail：全员矩阵 / 月度概览 / 设置 / 组件入口
└── SidebarInset
    ├── 自研 TopBar（月份 ‹ › / 回到本期 / 导出 · 导入备份）
    └── main.bg-background（平铺，不再有 framed-sheet 画布）
```

`Shell.tsx` 可整体移除。因为不保留深青，**无需覆盖 `--sidebar*` 一组变量**，
「引入组件全用默认 token」得以严格成立。

> ⚠️ 范围提醒（非障碍）：`paint_caption` 在 Rust 侧，本次不处理；
> 桌面壳若仍构建旧前端，会呈现「标题栏深青 + 内容浅色」，属已知且被接受的越界现象。

### 3.2 Token 架构（核心：`ui-` 前缀隔离 + 分两步走）

**不能做成两套独立数值**，否则主题切换时两边漂移。但也不能像最初设想那样立刻把项目 token
改成别名——那与 D15 的冻结策略冲突。实际分两步：

**阶段 2（已实施）**：只新增 `--ui-*` 层，`tokens.scss` 原样不动。

```css
@theme inline {
  --color-primary: var(--ui-primary);   /* 新组件 bg-primary 命中 shadcn 默认值 */
  --radius-lg: var(--ui-radius);
  /* …38 条映射 */
}
:root {
  --ui-background: oklch(100% 0 0);
  --ui-primary: oklch(20.5% 0 0);
  --ui-accent: oklch(97% 0 0);          /* 注意：与 tokens.scss 的 --accent 同名不同义 */
  --ui-radius: 0.625rem;
  /* …32 个 */
}
.dark { /* 31 个深色覆盖，未启用（主项目暂无暗色主题） */ }
```

**为什么必须加 `ui-` 前缀**：`tokens.scss` 里的 `--accent`（`#1b6c80` 深青）、
`--muted`（`#4c5256` 文字灰）、`--border`（`#d9dee2`）与 shadcn 同名但**语义完全不同**。
直接照抄 shadcn 的 `:root` 会把这几个值静默换掉，全站配色崩坏。加前缀后彻底隔离：

- 新组件：`bg-primary` → `--color-primary` → `--ui-primary` → shadcn 默认值
- 旧组件：`var(--accent)` → `tokens.scss` 原值

**阶段 7**：把 `tokens.scss` 的通用语义层改成 `var(--ui-*)` 别名，三个复杂组件零代码改动即跟随新值（§3.6）。

产物实测链路：`.bg-primary{background-color:var(--ui-primary)}`；
项目变量保持原值 `--accent:#1b6c80` / `--muted:#4c5256` / `--border:#d9dee2`。

### 3.3 `tokens.scss` 分三层重写

| 层 | 实际变量 | 处理 |
|---|---|---|
| 通用语义 | `--chrome*` / `--surface*` / `--canvas` / `--border*` / `--text*` / `--accent*` / `--shadow-*` | 转 shadcn 变量别名；阴影改用默认 `ring-*` / `shadow-*` 刻度 |
| 尺寸节奏 | `--radius-*`(3/4/6/8/12/16px)、`--sp-1~6`(4/8/12/16/24/32)、`--control-height: 30px`、`--fs-*`(10~28px) | 对齐 shadcn 刻度。⚠️ **shadcn 默认变量里没有间距/字号 token**，间距来自 Tailwind 4px 刻度、字号来自 `text-sm` 等工具类；这部分要么保留自定义值，要么自研组件改用 utility |
| 业务数据色 | `--shift-*-bg/ink` 六色、`--pay-*` 三档、`--todo-tone-*` 六色、`--overtime-*` | **不能转别名**（数据语义，非主题色）；保留但重新调明度/饱和度以贴合默认密度；夜班反相块必须保留 |

### 3.4 目录结构

```
src/
├── index.css               Tailwind 入口：@layer 顺序 + 两个 @import + 主题变量 + 边框重置
├── styles.scss             过渡期 legacy 入口（现有 7 层 @use），逐组件删除
├── styles/tokens.scss      阶段 2–6 原样保留（三组件冻结层），阶段 7 改值后删除
├── components/ui/          shadcn CLI 复制进来的组件源码（可直接改）
├── components/AppShell.tsx 外壳：SidebarProvider + SidebarInset + 顶栏容器（原 Shell.tsx）
├── components/AppSidebar.tsx 侧栏：品牌 + 三个一级页面入口
├── components/TopBar.tsx   顶栏：月份导航 + 导出/导入备份
├── components/surface.ts   抄来的样式基线常量，注明来源 / CLI 版本
├── components/             其余自研组件（按现有分层保留）
├── screens/                三个一级页面（阶段 4–5 逐个接 shadcn 控件）
├── lib/utils.ts            再导出 `cn`（components.json 的 utils 别名指向这里）
├── data/                   ★ 不动
├── platform/               ★ 不动
└── App.tsx / main.tsx
```

> `cn` 说明：shadcn 4.x 生成的组件直接 `import { cn } from "cn"`（npm 包，内部是 clsx + tailwind-merge），
> 这不影响 `components.json` 声明的 `@/lib/utils` —— CLI 里有些注册表条目仍从那里导入，
> 所以 `src/lib/utils.ts` 保留为一行再导出，两边都能解析。

### 3.5 SCSS 过渡策略（Tailwind v4 与 5715 行业务 SCSS 共存）

**为什么入口必须是 CSS**：`@tailwindcss/vite` 只处理 CSS 文件；把 `@import "tailwindcss"`
写进 `.scss` 会被 sass 当成文件路径解析而失败。所以 `index.css` 是唯一入口。

**为什么不能一次替换 7 层 SCSS**：业务层共 5715 行（shell 899 / schedule 1586 / stats 1109 /
settings 1356 / todos 440 / toasts 176 / wizard 149），不可能一次迁成 utility。

**优先级陷阱**：Tailwind utilities 位于 `@layer utilities`，而未分层的普通 CSS
**优先级高于任何 layer**。不处理的话 `.btn { padding: 0 10px }` 会盖掉 `px-4`，utility 全部失效。

**过渡方案（推荐，风险可控）**：

1. `index.css` 顶部声明 layer 顺序 + 显式扫描范围，然后**只导入 theme 与 utilities**：
   `@layer theme, base, legacy, components, utilities;`
   `@source "./**/*.{ts,tsx}";` + `@source not "../shadcn-lab"` / `"../dist"` / `"../dist-tauri"`
   `@import "tailwindcss/theme.css" layer(theme);`
   `@import "tailwindcss/utilities.css" layer(utilities);`
   **不导入 `tailwindcss/preflight.css`**——它会重置 `box-sizing` / `margin` / 标题字号，
   与现有 7 层基础层叠加会全站回归；等视图迁移完再评估是否引入。
2. `main.tsx` 里先 `import './styles.scss'`（legacy），再 `import './index.css'`。
3. **迁移期纪律：新旧不混用同一元素**——旧组件继续只用旧类名（`.btn` / `.cal-cell`），
   新组件只用 utility。这样 legacy 覆盖 utility 的问题不会实际发生。
4. 逐组件迁移：每迁完一个组件就删掉它对应的 SCSS 段落；阶段 6 结束时 `styles/` 只剩
   `tokens.scss` 的别名层（纯 CSS 变量），业务 SCSS 全部删除。
5. 若某处必须混用：优先把该元素的旧 CSS 改写成 utility；个别兜底用 `!px-4` 这类
   强制前缀，并在代码里注明原因。

> 不采用「把 5715 行 SCSS 整体包进 `@layer legacy`」：`@use` 规则必须在文件顶层，
> 无法包进 `@layer`；改造成本高于收益，且会打断 Vite 的 sass 编译链。

### 3.6 三个复杂组件的 token 冻结（Q2-A 已定）

D5 要求矩阵 / 月历 / 值班牌「完全不动」，但它们的外观全由 `var(--…)` 撑起。阶段 2 重写 token 后，
**代码不动、外观也会跟着变**（圆角 8→10、控件 30→32、间距重定、六色调色阶）。

严格实现「零代码改动 + 外观不变」的做法是**两套 token 并存**：

| 阶段 | 旧 `tokens.scss` | 新 `index.css` | 三组件外观 |
|---|---|---|---|
| 2–6 | **原样保留**，作为三组件的冻结层 | 新增 shadcn 别名层，供新组件使用 | 不变 |
| 7 | 各项值改成 `var(--新token)`，确认无人引用后删除 | 不变 | 一次性跟随新值 |

关键点：三组件的 SCSS 与 TSX **一个字都不用改**，阶段 7 只是让旧 token 名指向新值，
它们就自动完成对齐。这也是阶段 2 不能直接删掉旧 `tokens.scss` 的原因。

> 代价：阶段 2–6 期间存在两套 token（旧值 + 新别名），需约定「新组件只引用新 token、
> 旧组件只引用旧 token」，避免混用。阶段 7 清理旧层后只剩一套。

---

## 4. 已确认决策清单

| # | 决策 | 来源 |
|---|---|---|
| D1 | 本次重构**只涉及 web**；`desktop/src-tauri/`、NSIS、`miniapp-uni/` 不管 | 用户 18:24 |
| D2 | 外壳整体替换为 Sidebar + 自研 TopBar + `bg-background` 平铺（方案 A，全默认） | 用户 18:22 |
| D3 | 引入组件用默认 token；自研组件用项目 token；项目 token 重写以贴合整体风格 | 用户 18:11 |
| D4 | 技术栈升级到匹配 shadcn **不是问题**，不列为阻碍 | 用户 17:52 |
| D5 | **全员矩阵 / 个人月历 / 值班牌完全不动**，最后阶段才只调样式匹配风格，内部实现始终不碰 | 用户 18:28（要求记入日志） |
| D6 | 只抄 shadcn 的**样式层**，行为自己写；抄来的基线集中放一个常量文件并注明来源版本 | 用户 17:52 / 沙盒 `surface.ts` 验证 |
| D7 | 待办卡：Card 外壳 + 自研条目（B 结构 label 包裹 input），不引入 Label / Checkbox | 沙盒验证 |
| D8 | 每日明细可用 Table；sticky 表头、合计行在滚动区外、卡片跟随左卡高度由页面自己实现 | 沙盒验证 |
| D9 | 分组与成员在同一张卡内联动，分组列只在「全部 / 未分组」显示 | 沙盒验证 / 主项目 README §4 |
| D10 | 日志不属于项目开发范畴，照常写；代码改动需等明确指令 | 用户 18:29 |
| D11 | 技术栈选**最小升级档（A）**：Vite 4.5.14 → `^5.4.21`、React 18.3.1 → `^19.3.1`（`@types/react` 同步 19），上调 `engines.node` 与 `allowBuilds`；TS 5.9.3 / vitest 0.34.6 保留；不引入 `@vitejs/plugin-react` | 用户 19:15 选 A，19:25 补入 React 19（ref-as-prop 依据见 §2.1） |
| D12 | 三个弹层（矩阵改班 / 日历改班 / 新建班序）统一收拢到设置页的 `DialogShowcase`；业务页不再各自放 Dialog，内部业务表单仍是自研占位 | 用户 19:17 / 沙盒验证 |
| D13 | SCSS 过渡采用「入口改 CSS + 新旧不混用同一元素 + 逐组件删除」，不整体包 `@layer` | 用户 19:25 采纳 §3.5 |
| D14 | `desktop/vite.config.ts` 纳入本次范围，**只补** `@tailwindcss/vite` 与 `@` alias；Rust 壳 / 打包不动 | 用户 19:29 确认（原 Q1） |
| D15 | 三个复杂组件的 token **冻结**：旧 `tokens.scss` 原样保留到阶段 7，再让旧 token 名指向新值 | 用户 19:29 确认（原 Q2，做法见 §3.6） |
| D16 | shadcn 语义变量统一加 **`ui-` 前缀**，用 `@theme inline` 映射；`tokens.scss` 阶段 2–6 完全不动 | 阶段 2 实施时发现 `--accent` / `--muted` / `--border` 同名不同义 |
| D17 | ~~不导 preflight，单补边框两条~~ → **已被 D20 取代**（实测补丁不够，见 D20） | 阶段 3 首次实现 |
| D20 | **导入完整 preflight**（`@import "tailwindcss"`），与沙盒 `shadcn-lab` 一致；字体只取 Geist 的 latin 子集并作用于 `[data-slot]` | 阶段 3 目视回归发现三处硬伤：`<ul>` 保留 UA 的 `list-style:disc` + `padding-inline-start:40px`（导航行冒圆点、整块右移 40px）；`<button>` 保留 ButtonFace `#f0f0f0`（SidebarRail 变成 18px 灰带）；`<svg>` 非块级导致图标基线错位。逐条补丁会漏，preflight 一次解决 |
| D21 | 把沙盒 `index.css` 里被漏掉的两段补进主项目：**`*{border-color:var(--ui-border)}`** + **shadcn 的 9 个 `data-*` 变体与 `no-scrollbar`**（抄自 `shadcn@4.23.0/dist/tailwind.css`） | 阶段 3 修正：前者导致侧栏右边出现纯黑 1px 竖线（`border-r` 颜色默认 `currentColor`）；后者导致三个菜单项一起变灰（Tailwind 内置 `data-active:` 只判属性存在，React 会渲染 `data-active="false"`） |
| D18 | 图标改用 `lucide-react`，不再内联 SVG | Sidebar / Sheet / Tooltip 的组件源码已依赖它；打包进产物，不产生网络请求，不违背 `file://` 离线约束 |
| D19 | 新组件文件落在 `src/components/`（`AppShell` / `AppSidebar` / `TopBar`），不另建 `src/app/` | 现有 `components/` + `screens/` 分层已足够；避免两套目录语义并存（§3.4 的目标树据此修正） |

---

## 5. 组件映射表

| 主项目组件 | 处理 | 依据 |
|---|---|---|
| `Shell.tsx`（L 形外框） | **已删除**，换成 `AppShell`（SidebarProvider + SidebarInset）/ `AppSidebar` / `TopBar` | D2、D19 |
| `Select.tsx`（自绘下拉） | 换 shadcn `Select` | 标准控件 |
| `ToastHost.tsx` | 换 `sonner` | shadcn 已弃用自带 toast |
| `ShiftEditor` / `DayEditor` / `PatternEditor`（三个弹层） | 外壳换 `Dialog`，**统一收拢到设置页的 `DialogShowcase`**，业务页不再各自放弹层；内部业务表单保留自研占位 | D12 |
| `StatsPanels`（四块统计） | 外壳用 `Card`，每日明细用 `Table`，业务口径仍自研 | D8、沙盒验证 |
| `TodoCard` | Card 外壳 + 自研条目，样式基线抄 `Label` | D7 |
| `MemberGroupTabs` / `MemberRowsEditor` | 同一张卡内联动：分组 tab + Table | D9 |
| `PatternList` / `PatternEditor`（24 格） | 保持自研占位，最后视情况调整 | 高度定制 |
| `ProfileSection` / 备份区 | 表单控件换 shadcn `Input` / `Label` / `Switch` | 标准控件 |
| **全员矩阵 `TeamMatrix`** | **完全不动，最后只调样式** | D5 |
| **个人月历 `MonthCalendar`** | **完全不动，最后只调样式** | D5 |
| **值班牌** | **完全不动（连外壳都不换），最后只调样式** | D5、用户 17:22 |

---

## 6. 实施阶段

| 阶段 | 产出 | 验收 | 回滚点 |
|---|---|---|---|
| 0 · 基线 | 记录 `build` / `test` 结果与产物哈希；`verify:dist` 属实机验收，按测试边界规则需用户明确指令后再跑 | 已授权的命令通过 | — |
| 1 · 技术栈 | **升 Vite 4.5.14 → ^5.4.21、React 18.3.1 → ^19.3.1**（§2.1）；新增 Tailwind v4 插件、`@` alias、`components.json`；**根与 `desktop/` 两处同步补插件与 alias**（D14）；上调 `engines.node`、`allowBuilds` 加 `@tailwindcss/oxide`。TS / vitest 不动 | `pnpm build`、`pnpm test`（271 例）通过；`file://` 双击不白屏；`desktop/` 构建不报错 | 独立 commit，可单独 revert |
| 2 · Token 与 SCSS 共存 | `index.css` 三层结构 + `@layer` 顺序落地（§3.5）；**新 token 写进 `index.css`**；旧 `tokens.scss` **原样保留**作为三组件冻结层（§3.6）；legacy SCSS 仍由 `styles/index.scss` 引入 | 浅/暗切换一致；271 单测通过；**三组件外观与基线一致**；旧页面无回归 | 旧 `tokens.scss` 未改动，无需备份 |
| 3 · 外壳 | 删 `Shell.tsx`，换成 `AppShell` + `AppSidebar` + `TopBar`（SidebarProvider / SidebarInset，画布平铺）；`shell.scss` 只留画布层 | 三视图可切换、折叠、窄屏 Sheet；`file://` 直接打开不白屏 | 组件级 commit（`Shell.tsx` 可从 git 恢复） |
| 4 · 通用控件 | 按 §5 逐个替换 Dialog / Select / Popover / Tabs / Input / Switch / Toast / Table | 键盘与焦点行为可用；`verify:dist` DOM 断言同步修 | 每个组件一个 commit |
| 5 · 自研简单组件 | 待办卡、统计卡、成员卡按沙盒验证的形态重写；**三个弹层收拢到设置页 `DialogShowcase`**；`surface.ts` 集中样式基线 | 静态假数据展示一致（重构后接真数据）；业务页无残留 Dialog | 每个组件一个 commit |
| 6 · 文档与验收 | 同步 `AGENTS.md` / `DESIGN.md` / `README.md` 的过时条款；跑全套验收 | `build` / `test` / `verify:dist` 全绿 | — |
| 7 · 最后调三个复杂组件 | 把冻结的旧 token 值改成 `var(--新token)`，让三组件跟随新体系；再按需微调样式。**不动结构 / 逻辑** | 三组件视觉与新体系一致；三组件 TSX diff 为空（仅样式值变化）；数据层 diff 为空 | 样式单独 commit |

> 阶段 1–6 期间，全员矩阵 / 个人月历 / 值班牌**一行不改**（D5）。
> 阶段 2 期间旧 `tokens.scss` 原样保留作为冻结层，三组件**外观也不变**（§3.6）；
> 阶段 7 才让旧 token 指向新值，一次性完成对齐。

---

## 7. 风险与缓解

| # | 风险 | 缓解 |
|---|---|---|
| R1 | **Tailwind preflight 与现有 7 层全局 SCSS 叠加**：`box-sizing`、`:focus-visible`、`.btn/.input` 基础层被重置；另外**未分层 SCSS 会覆盖 `@layer utilities`** | 阶段 3 起**导入完整 preflight**（D20，实证：缺它 shadcn 组件会变形）。preflight 在 `@layer base`，未分层 SCSS 优先，爆炸半径只限「依赖浏览器默认值」的属性；已知待观察项：`.settings-label h2` 未声明 `font-weight`（会从 bold 变 400）、`.error-list` 的 `disc` 圆点会被去掉。用 §3.5 的 layer 顺序 + 「新旧不混用同一元素」纪律；三档断点（≤1399 / ≤1023 / ≤639）全量视觉回归 |
| R12 | **移动端导航形态改变**：旧外壳在 ≤1023px 把侧栏变成底部标签栏（三格等分），`Sidebar` 则在 <768px 变成左上角触发的 Sheet 抽屉 | 属方案 A 的既定取舍（D2）；若需要保留底栏，阶段 7 之后单独补一个移动端导航层，不影响本次结构 |
| R2 | **`file://` IIFE 产物链脆弱**：`fileProtocolFriendlyPlugin` 靠正则替换 `<script type="module" crossorigin src=`，Vite 4→5 的 HTML 输出格式变化会白屏 | 阶段 1 立刻双击验证；同样重验 SW 指纹注入与 `stripPwaAssetsPlugin` |
| R3 | **`verify-dist.mjs` 412 项 DOM 断言**依赖 `.dialog` / `.cal-cell` / `.btn-primary` 等 class；Radix Portal 到 body 后大面积失效 | shadcn 组件透传 `className`，保留原类名作契约，把改动压到几十处；阶段 4 分批修 |
| R4 | **两份 Vite 配置**：`desktop/vite.config.ts` 独立且共用 `src/`，漏配插件/别名导致桌面产物构建失败 | **已定（D14）**：两处同步补插件与 alias，Rust 侧不动；阶段 1 验收加 `desktop/` 构建不报错 |
| R5 | **密度重定**：30px 控件 / 8px 圆角 / 12–16px 内边距 → 32px / 10–14px / 24px，1466 宽基准下月历 + 待办 + 四块统计可能塞不下 | 阶段 5 先按沙盒布局验证；D5 三组件不动，重排只作用于其余区域 |
| R6 | **字体与离线**：主项目系统栈且明确不加载网络字体；shadcn 默认 Geist | 用 `@fontsource-variable/geist` 本地打包（非网络字体），重验 IIFE + `file://` |
| R7 | **vitest 0.34 与 Vite 5 的兼容**：其内置 vite 依赖范围含 `^5.0.0-0`，理论可用但需实测 | 阶段 1 跑 `pnpm test` 全绿即通过；若冲突再单独升 vitest 到 1.x（不牵动已定的 React 19 / TS 5.9） |
| R8 | **Tailwind 扫描**：常量里的类名必须是完整字符串，动态拼接不生成规则 | 抄来的基线集中放 `surface.ts` / `views.ts`，用完整字面量（沙盒已验证） |
| R9 | **样式副本分叉**：抄来的 shadcn 样式不随 CLI 更新 | 常量注明来源文件 + CLI 版本，定期 `shadcn add <name> --diff` 对照 |
| R10 | **1px 线 / grid stretch 等渲染细节** | 沙盒已验证：分组线用 `border-b` 而非独立 `Separator`；被拉高的卡用 `flex-1` + `mt-auto` 填充；Table sticky 需关掉内部 `overflow-x-auto` |
| R11 | **React 19 的类型收紧**：`@types/react@19` 对 `ReactNode`、`ref`、`useRef` 参数等更严格，可能出现一批类型错误 | 阶段 1 先跑 `tsc --noEmit` 收敛；主项目已核实无 `defaultProps` / `propTypes` / `forwardRef` / `ReactDOM.render`，预计改动集中在少数泛型标注 |

---

## 8. 验收标准

```bash
pnpm build           # build-guides + tsc --noEmit + vite build
pnpm test            # 271 例，数据层断言不得改动
pnpm verify:dist     # CDP 断言（README 记 412 项；脚本内 248 个调用点），DOM 定位随 Portal 调整后全绿
```

额外人工验收（按测试边界规则，实机/截图需用户明确指令）：

- `file://` 双击 `dist/index.html` 可用
- 浅 / 暗主题切换，所有组件一致
- 三档小屏断点无横向溢出
- 三个复杂组件（矩阵 / 月历 / 值班牌）**结构与逻辑 diff 为空**
- 主项目 `src/data/` 与 `platform/` diff 为空

---

## 9. 回滚策略

| 层 | 回滚 |
|---|---|
| 技术栈 | 阶段 1 独立 commit，`git revert` 即可 |
| 组件 | 每个组件单独 commit，`git revert` 该 commit 即回到自绘实现；只移除 `ui/` + `components.json` 不能还原，因为调用方已被改写 |
| 样式 | 阶段 2 保留旧 `tokens.scss` 备份至阶段 6；SCSS 从未强制删除 |
| 冻结层 | 旧 `tokens.scss` 阶段 2–6 未改动；阶段 7 改值时单独 commit，可整条 revert |
| 数据 | `src/data/` / 备份 v5 / 271 单测全程零改动，不存在数据回滚成本 |

---

## 10. 原待确认项（已闭合）

| # | 原问题 | 结论 |
|---|---|---|
| Q1 | `desktop/vite.config.ts` 是否算本次范围 | **算**，只补插件与 `@` alias，Rust 侧不动 → D14 / §1.4 |
| Q2 | 三个复杂组件的 token 是否冻结 | **冻结**，旧 `tokens.scss` 原样保留到阶段 7 → D15 / §3.6 |

> 至此方案内无未决项；实施中出现新的边界问题，按同样格式追加到本章。

---

## 附录 A · 沙盒已验证的结论（`shadcn-lab/`）

- shadcn 不是 npm 组件库：CLI 把 `.tsx` 源码复制进仓库；包与原语均为 MIT
- `components.json` 的 `style` 枚举 24 个，按 `radix-* / base-* / aria-*` 分三套底座；初始化后不可改
- CLI `init --preset` 只收 `nova/vega/…`，底座要用 `--base radix` 单独指定
- init 预检要求先装 `tailwindcss` + `@tailwindcss/vite` 并配 `@` alias；
  TS 7 移除 `baseUrl`（沙盒经验，最小升级档保留 TS 5.9，**不适用**）
- `index.css` 实测：`@theme inline` 40 条映射、`:root` 32 个变量、`.dark` 31 个
- 默认 `--sidebar: oklch(0.985 0 0)`（近白），不是深青 → 保深青就必须覆盖 `--sidebar*`，与「全默认」冲突
- `Label` 的 className 在 Radix 版与 Base UI 版**逐字相同**；Label 不含勾选框，官网 demo 的 checkbox 是另一组件
- `Table` 只依赖 `cn`，导出 8 个部件；容器 `overflow-x-auto` 会让 `sticky` 失效，需页面层 `[&_[data-slot=table-container]]:overflow-visible`
- 待办卡 B 结构（label 包裹 input）有效，`peer-disabled:*` 会失效，需改用 `has-*` 或 state
- 抄样式基线集中放 `surface.ts`，产物 CSS 已核实能扫到常量里的完整字符串
- **17 个 `ui/*.tsx` 全部不使用 `forwardRef`**，依赖 React 19 的 ref-as-prop：
  React 18 下 `ref` 会被剥离，`asChild` 触发的定位 / 焦点会静默失效 → 这是 §2.1 纳入 React 19 的直接依据
- 17 个组件在 Vite 8 + React 19 下构建通过（2198 modules），`Dialog` / `Table` / `Sidebar` 均已实际使用
- 三个弹层已收拢到 `DialogShowcase`（设置页），业务页不再各自持有 Dialog

## 附录 B · 依赖清单（最小升级档 / 技术栈 A）

```
必需升级
  vite                      4.5.14 → ^5.4.21     @tailwindcss/vite peer 要求 ≥5.2
  react / react-dom         18.3.1 → ^19.3.1     shadcn 4.x 组件用 ref-as-prop，无 forwardRef
  @types/react(-dom)        18.3.x → ^19.3.0
  package.json engines.node >=18 → >=20.18.1      shadcn CLI / oxide 要求
  pnpm-workspace.yaml       allowBuilds + @tailwindcss/oxide

保持不变（明确不动）
  typescript                5.9.3（满足 @types/react@19 的 TS ≥5.0 要求）
  vitest                    0.34.6（阶段 1 实测；冲突才单独升 1.x）
  lunar-javascript / xlsx / sass（过渡期）/ esbuild

新增
  tailwindcss 4.3.5 + @tailwindcss/vite 4.3.5
  shadcn CLI 4.23（仅生成组件时使用；可 eject 去掉运行时依赖）
  radix-ui  class-variance-authority  cn  lucide-react  sonner
  next-themes  tw-animate-css  @fontsource-variable/geist  @types/node

不引入
  @vitejs/plugin-react      主项目 JSX 由 esbuild 处理，非必需
  Vite 8 / TS 7 / vitest 3  全升档，未采纳
```
