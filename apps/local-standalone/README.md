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

## 大屏（PC）优化

离线版主要在 PC 上用，所以样式在 `≥1440px` 做了三档大屏适配，全部集中在
`src/styles/12-desktop.scss`（最后引入，靠文件顺序覆盖前面的规则）。

| 档位 | 内容宽度 | 日期列 | 一屏可见天数 |
|---|---|---|---|
| ≤1023 | 沿用原样 | 60px | 6 / 30 |
| 768（平板档） | 沿用原样 | 74px | 8 / 30 |
| 1280 | 沿用原样 | 60px | 9 / 30 |
| ≥1440 | 97% 视口 | 52px 起自动均分 | 14 / 30 |
| ≥1800 | 98% 视口 | 34px 起自动均分 | **30 / 30，无需横向滚动** |
| ≥2400 | 98% 视口 | 自动均分 | 30 / 30 |

三件事：

1. **解除 `max-width: 1360px` 封顶**（改为 `min(100% - 48px, 2600px)`）。
   1920 下宽度利用率 71% → 98%，2560 下 53% → 98%，3440 下 40% → 76%。
2. **字号与控制尺寸分档上浮**：原来 1024px 以上全部是同一套写死的 px，
   2560 屏幕上日期还是 17px；现在按档递增到 22px。
3. **日期列自动吃满可用宽度**：原来是固定 `60px`，31 天需要 1978px，
   在任何屏幕上都必然横向滚动。改为 `grid-auto-columns: minmax(下限, 1fr)`
   之后列宽自动均分、低于下限才滚动，因此 ≥1800 能一屏看完整月。
   `display: block + width: 100%` 保证每行拿到确定宽度，各行独立算出的
   `1fr` 结果一致，表头与数据行仍逐列对齐（有断言校验）。

另外的顺带修复：

- **排班日历的农历/节气文字被裁**（见下）。
- 修复 `10-responsive-final.scss` 里无上界的 `max-width: 852px` 把
  `08-miniapp-schedule.scss` 的 `min-width: 900px` 覆盖掉的问题
  （900–1023px 区间容器被压到 852px，日期列还是 82px，实测只看得见 7 天）。
- 删除 `08-miniapp-schedule.scss` 里的死代码 `.desktop-layout`（DOM 中不存在）。
- PC（`hover: hover and pointer: fine`）上放开 `user-select`，可以选中复制
  薪资数字、姓名等；移动端仍保持禁选。可点击控件在两端都保持禁选。

### 排班日历裁剪修复

日历每个单元格的右侧原本都有一道被裁掉的农历文字残影，1024/1280/1440/1920
全部命中（实测 35/35 个单元格）。三个叠加原因：

1. `.calendar-cell` 是 `<button>`，**Chrome 的 UA 样式默认给按钮
   `padding: 1px 6px`**，而所有样式表都没重置过它 —— 单元格本来只有
   56~64px 宽，这 12px 直接吃掉了内容宽度。
2. `.calendar-lunar-spacer` / `.calendar-lunar` 在 `08-miniapp-schedule.scss`
   里是 `flex: 0 0 22px`（不能收缩）；`10-responsive-final.scss` 只写了
   `width: 14px`，flex-basis 仍是 22px，于是日期行实际内容宽度是
   `22 + 3 + 20 + 3 + 22 = 70px`。
3. `.calendar-date-wrap` 只有 48px 宽，flex 居中后内容向两侧各溢出，
   再被 `.calendar-cell` 的 `overflow: hidden` 裁掉。

修法：重置 UA padding 为 0，把 spacer/lunar 的 flex-basis 一起降下来，
并让 wrap 宽度等于内容宽度（`12 + 4 + 20 + 4 + 12 = 52px`，≥1440 用 56px）。

改完之后 `≤1439px` 的所有档位（含 390 手机、768 平板、1024、1280）实测
逐项数值与改造前一致，只有日历那处是修 bug。

## 数据

数据只存在当前浏览器当前站点的 localStorage 中，没有服务器、不会跨设备同步。
因此界面提供了「导出备份 / 导入备份」（JSON），用于换设备和防止清缓存丢数据。

如果浏览器禁用了 localStorage（隐私模式等），会自动退化为内存存储，
页面顶部会给出提示，此时刷新会丢数据。

## 视觉审计 / 回归工具

`scripts/screenshot-dist.mjs` 会在多个分辨率下真实打开产物、截图、量布局，
并跑一批硬性检查（表头与数据行列对齐、班次标签不溢出单元格、
≥1800 整月不横滚、大屏宽度利用率、PC 可选中 / 移动端不可选）：

```bash
node scripts/screenshot-dist.mjs
```

截图输出到 `screenshots/`（已在 `.gitignore` 里）。改样式之后重跑这个脚本，
就能直接看出大屏有没有退化。

## 本地模式下的权限

本地版把使用者视为管理员，所以人员切换器、团队统计对比图这些原本
只有管理员可见的功能全部保留可用。
