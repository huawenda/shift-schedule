# JIG Data Finder 功能移植方案

> 目标：把 `D:\Dev\JIG-Data-Finder` 的**业务功能**移植进本项目，以侧栏 tab 为入口。
> UI 全部按本项目风格与既有组件重做，不搬原项目任何界面代码。
>
> 状态：**待评审**。本文只写方案，未改任何源码。

---

## 一、已确认的前提

| 议题 | 决定 |
|---|---|
| 平台范围 | **只做 Tauri 桌面壳**。web 静态版不出 JIG 入口；微信小程序端本阶段不涉及 |
| 侧栏入口 | **1 个入口 + 页内 Tabs**（侧栏新增一组，页内分四段） |
| Excel 导出 | **引入 `xlsx-js-style`，保留尺寸不匹配行的红色标记** |
| 配置存储 | **业务配置进备份文件（固定包含），本机偏好进 localStorage** |
| 映射表排序 | **用本项目人员配置的 pointer events 拖拽方案**（不用 HTML5 drag，不需要开白名单） |
| 源文件目录 | **记住上次打开的目录**（本机偏好，不进备份） |
| 应用定位 / 品牌 | **最后再定**，本阶段不动产品名、图标、描述 |

---

## 二、资产盘点：搬什么 / 重做什么 / 不做什么

原项目 `src/` 共 6057 行，按「业务 vs 界面」切得很干净。

### 2.1 原样搬（纯 TS，零 DOM 依赖）

| 文件 | 行数 | 内容 | 处置 |
|---|---|---|---|
| `core/table.ts` | 41 | `Row` / `Table` 类型与工具 | 搬，改命名空间 |
| `core/query.ts` | 214 | 左连接查询、明细表整理、审查数据处理、排序 | 搬 |
| `core/pivot.ts` | 312 | 透视生成、小计/总计组装、下钻定位、可用性分档 | 搬 |
| `core/validate.ts` | 126 | 尺寸码提取与严格 4 位全等判定 | 搬 |
| `core/mapping.ts` | 112 | 型号↔尺寸映射的增删改排序与校验 | 搬 |
| `core/review.ts` | 82 | 审查行分类与筛选口径 | 搬 |
| `core/clipboard.ts` | 68 | 从混合文本里提取 JIG ID 的正则 | 搬 |
| `core/excel.ts` | 103 | Excel 读 / 带样式写 | 搬（写入换 `xlsx-js-style`） |
| `core/config.ts` | 365 | 配置类型 + 默认值 + 合并 | **拆**：业务配置留、窗口/托盘/界面偏好走本项目 |

配套 `tests/` 11 个文件全部搬，作为移植的**回归基准**。

### 2.2 重做（用本项目组件，不搬样式）

| 原项目 | 本项目替代 |
|---|---|
| `ui/Grid.tsx`（538 行，自绘虚拟表格） | 本项目 `ui/table.tsx` + 自写的 `JigTable`（列宽/固定首列/固定尾列/小计总计分色） |
| `ui/OverlayScrollbar.tsx`（240 行） | **直接用本项目 `ScrollOverlay.tsx`**（已是同类实现，且已接管 `.canvas` 等容器） |
| `ui/StageRail.tsx`（84 行，工序轨道） | 用本项目统计卡的条形图语言重画（`stats.scss` 的 `.ot-bar`） |
| `ui/SettingsDialog.tsx`（339 行） | 本项目 `ui/dialog.tsx` + `ui/input.tsx` + `ui/select.tsx` 重组 |
| `ui/SizeMappingDialog.tsx`（277 行） | 同上；拖拽排序用本项目已有的 HTML5 拖放**禁用**约定 → 改为上移/下移按钮（与 `mapping.ts` 的 `movePair` 正好配套） |
| `styles/app.css`（1565 行） | **不搬**。新写 `src/styles/jig.scss`，只消费本项目令牌 |
| `App.tsx`（1326 行） | 只搬「状态编排」思路，界面按本项目结构重写 |

### 2.3 不搬

| 原项目 | 原因 |
|---|---|
| `src-tauri/src/lib.rs`（托盘 / 单实例 / `legacy_config_dir`） | 本项目已有托盘、单实例、主题同步 |
| `src-tauri/tauri.conf.json` | 本项目已有自己的窗口配置 |
| `core/theme.ts` | 本项目已有完整主题机制（三态 + 原生标题栏同步） |
| `ui/bridge.ts` 的配置读写 | 本项目配置走 localStorage / 备份文件，不走 `%APPDATA%` |

---

## 三、目标结构

```
src/
  features/jig/                  ← 新增，JIG 功能全部收在这里
    core/                        ← 业务逻辑（从原项目 core/ 平移，零改动）
      table.ts  query.ts  pivot.ts  validate.ts
      mapping.ts  review.ts  clipboard.ts  excel.ts  config.ts
    components/
      JigScreen.tsx              ← 页面骨架：源文件条 + 左右两栏 + 页内 Tabs
      JigSourceBar.tsx           ← 顶部：源文件路径 / 载入 / 导出 / 型号尺寸映射
      JigQueryPanel.tsx          ← 左栏：JIG ID 输入、粘贴、开始查询
      JigTable.tsx               ← 表格（替代原 Grid）
      JigStageRail.tsx           ← 工序轨道（替代原 StageRail）
      JigToolbar.tsx             ← 各视图的操作条（显示范围 / 可用性 / 导出）
      JigSizeMappingDialog.tsx   ← 型号↔尺寸映射维护
    hooks/
      useJigSource.ts             ← 源文件选择与读取
      useJigConfig.ts             ← 配置读写（备份 / localStorage 分流）
    styles/jig.scss              ← 新写，只用本项目令牌
```

**约定**：JIG 目录与本项目现有 `src/data/`、`src/components/` 平级但独立，核心是「业务逻辑不认识 UI」。`core/` 里的文件可以直接被测试和未来的其它入口复用。

---

## 四、外壳接入

### 4.1 路由

`Route` 由 `matrix | overview | settings` 扩为 `matrix | overview | jig | settings`。

- hash：`#/jig` / `#/jig/query` / `#/jig/query-pivot` / `#/jig/pivot` / `#/jig/review`
- **JIG 页不参与结算月**：现有 hash 把月份放在最前（`#/2026-10/matrix`），JIG 与月份无关，需要在 `parseLocation` / `buildHash` 里把「月份」与「JIG 子页」解耦 —— 建议 hash 结构调整为 `#/{month?}/{view}/{param?}`，JIG 的 param 走 JIG 自己的子页。
- `ROUTE_TITLE` 加 `jig: 'JIG 数据'`。

### 4.2 侧栏

`AppSidebar` 现有结构：`SidebarHeader`（品牌）+ `SidebarGroup`（视图：全员矩阵 / 月度概览）+ `SidebarFooter`（设置）。

新增一组 `SidebarGroup`，label **「JIG 数据」**，内含一项 `JIG 数据`（图标 `Table2` 或 `Boxes`）。`isActive` 判定按 `route === 'jig'`。

**仅 Tauri 显示**：`isTauriShell()` 为 false 时整组不渲染（web 静态版没有文件读写与剪贴板能力）。

底部 `MobileNav` **不动** —— 窄屏下不提供 JIG。

### 4.3 顶栏

现有 `TopBar` 是「月份导航 + 导出/导入备份」，对 JIG 页无意义。方案：`AppShell` 按 route 切换顶栏内容。

| route | 顶栏 |
|---|---|
| matrix / overview | 现状不动 |
| jig | JIG 专用条：源文件路径（截断 + tooltip）、`载入`、`导出`、`型号尺寸匹配` |
| settings | 现状不动 |

### 4.4 画布

JIG 页在 `.canvas` 内**自成一个两栏布局**（左栏 ~320px：JIG ID 输入与操作；右栏：工具条 + 工序轨道 + 表格），右侧表格区自己横向滚动。

关键约束（来自本项目已有教训）：

- 底部留白由 `.canvas-flow` 统一给，JIG 不额外加；
- **表格列宽按容器宽度判，不按视口** —— 用 `@container` 具名容器（同 `settings.scss` 已有做法）；
- 中文字段名默认可在任意字间断行，窄列必须显式 `white-space: nowrap` + `text-overflow: ellipsis`。

---

## 五、数据流

```
用户选 Excel（原生对话框）
      ↓  fs::readFile（壳内）
  JigSource { columns, rows, fileName }
      ↓
  ┌───────────────┬────────────────┬──────────────┐
  │ queryData     │ generatePivot   │ processSource │
  │ （左连接）      │ （全量透视）      │ （审查）        │
  └───────────────┴────────────────┴──────────────┘
      ↓
  applySizeMapping（型号→尺寸）→ validateSizeMatch（标红）
      ↓
  JigTable（渲染） / writeExcel（导出，带红色标记）
```

四个视图的依赖关系（保持原项目语义）：

| 视图 | 数据来源 | 特有能力 |
|---|---|---|
| 查询结果 | `queryData(源, 输入的 JIG ID 列表)` | 左连接，未命中填「【未找到】」 |
| 结果透视 | `generatePivot(命中行)` | 计数格可点下钻 |
| 全量透视 | `generatePivot(全部行)` | 工序轨道、显示范围（全部/生产中/单 P/N）、可用性筛选 |
| 数据审查 | `processSource(源)` | 只留 INPRODUCTION，按 P/N 过滤，异常行标红可导出 |

下钻状态（`DrillState`）保持「只存定位键 + 面包屑，明细现算」—— 这样改了映射表，明细立刻跟着更新。

---

## 六、配置拆分

### 6.1 业务配置 → 进备份文件

| 项 | 说明 |
|---|---|
| `jigSizeMapping` + `jigSizeMappingOrder` | 16 个型号 → 尺寸串，**现场核心资产** |
| `engineeringConfig` | 11 道工序及其顺序 |
| `outputColumns` / `sortColumns` / `numericSortColumns` | 输出列序与排序规则 |
| `pivotExcludePns` / `pivotExcludeNames` | 透视黑名单 |
| `pnExtractStart` / `pnExtractLength` | P/N 尺寸码取值位置（默认 6 / 4） |
| `sizeSpecialMappings` / `allSizeValue` | 特殊映射与「All Size」判定 |
| `sizeValidationEnabled` | 是否启用尺寸校验 |
| `productionIndicatorCode` / `jigStatusColumn` / `jigStatusActiveValue` | 状态口径 |
| `keywordTotal` | 总计列名 |

**备份文件结构变更**（`BACKUP_VERSION` 5 → 6）：

```jsonc
{
  "app": "shift-schedule-local",
  "version": 6,
  "exportedAt": "...",
  "roster": { ... },        // 排班数据，不变
  "jig": { ... }           // 新增：JIG 业务配置
}
```

`parseBackup` 需要：
- 接受 `version === 6`；
- `jig` 段**可选** —— 缺失时用默认配置，不报错（排班用户可能不装 JIG 数据）；
- **旧格式不做兼容**是本项目既有策略（`backup.ts` 头注：直接改 version，旧文件一律报错）。所以版本号直接跳到 6，v5 文件按既有策略报错重导。

### 6.2 本机偏好 → localStorage（不进备份）

| 项 | 存储键 |
|---|---|
| 源文件默认目录 | `shift-schedule:local:jig:source-dir:v1` |
| 导出默认目录 | `shift-schedule:local:jig:export-dir:v1` |
| 表格行高 | `shift-schedule:local:jig:row-height:v1` |
| 导出文件名加时间戳 | `shift-schedule:local:jig:export-timestamp:v1` |
| 粘贴时自动提取 JIG ID | `shift-schedule:local:jig:clipboard-process:v1` |

主题**不另设**：沿用本项目已有的三态主题（跟随系统/浅色/深色）+ 原生标题栏同步。

---

## 七、Tauri 侧改动

### 7.1 新增依赖

| 依赖 | 版本 | 用途 |
|---|---|---|
| `tauri-plugin-clipboard-manager` | 2 | 读取系统剪贴板（WebView2 里 `navigator.clipboard.readText` 在 onPaste 中必被拒，这是「从邮件正文直接粘贴」的前提） |
| `xlsx-js-style` | npm | 带样式的 Excel 导出（社区版 `xlsx` 写不了单元格样式） |

`xlsx-js-style` 与现有 `xlsx`（SheetJS 社区版）**并存**：读用 `xlsx`（已在依赖里），写用 `xlsx-js-style`。两者体积都在 1MB 级，只在 JIG 页按需 `import()`，不进主 chunk。

### 7.2 capabilities 放开

当前 `fs` 权限限定在 `$DOWNLOAD` / `$DOCUMENT`，**读不到用户自选的 Excel 路径**。

方案：
- `fs:allow-read-file` 放开到 `{"path": "**"}` —— 但这与本项目现有「fs 刻意收窄」的注释冲突。

更窄的做法（推荐）：**新增一个自定义 Rust 命令** `read_picked_file(path) -> Vec<u8>`，能力面只有「读用户刚在对话框里选中的那一个文件」，与现有 `save_backup_to` 对称（只写用户指定目录下的一个文件）。这样不扩大 fs 插件的通配权限，也保留现有安全姿态。

代价：需要在 Rust 里校验路径确实来自对话框（可用一次性 token 表，或接受「用户自己选的路径」这一事实）。

### 7.3 命令清单

| 命令 | 作用 |
|---|---|
| `read_picked_file(path) -> Vec<u8>` | 读用户选中的 Excel |
| `save_jig_export(dir, file_name, bytes) -> String` | 导出 Excel（复用 `save_backup_to` 的窄能力模式即可，扩展成接受二进制） |

---

## 八、UI 重做要点

### 8.1 视觉语言

全部使用本项目令牌，不引入新色：

| 语义 | 令牌 |
|---|---|
| 画布 / 卡片底 | `--surface` / `--canvas` |
| 尺寸不匹配标红 | `--destructive`（本项目已有语义色），不用原项目的 `#EF4444` 写死 |
| 小计行 | 卡片 `bg-muted/50` + 文字 `font-medium`（对应原项目「加粗 + 浅蓝底」） |
| 总计行 | 同上但更重 + `border-t`（对应原项目「加粗 + 浅绿底」） |
| 工序条形 | 复用 `stats.scss` 的 `.ot-bar` 写法 |

### 8.2 表格

- **不引入虚拟滚动**：JIG 数据上限 40 CST × 20 slot = 800 行，本项目无虚拟滚动依赖，直接渲染可接受。
- 表格要支持：列宽（首列 P/N 与次列 CST ID 固定）、小计/总计分色、计数格可点、尾列「总计」贴右。
- 用 CSS Grid 还是 `<table>`：**用 `<table>` + `position: sticky` 固定首列**（本项目 `ui/table.tsx` 已是 table 语义）。

### 8.3 映射表排序：用 pointer events，不用 HTML5 drag

本项目上一轮已全局禁用 HTML5 原生拖拽（`main.tsx` 在 document 捕获阶段取消 `dragstart`），
以免拖链接时浮出 URL 预览卡片。**但那套屏蔽只管 HTML5 drag** ——
本项目人员配置的成员排序（`MemberRowsEditor.tsx` 的 `onSortPointerDown/Move/Up`）
走的是 **pointer events + `setPointerCapture`**，与 HTML5 drag 是两套机制，不受影响。

映射表排序沿用同一套：手柄 `⠿` + `setPointerCapture` + 固定步长位移 + 拖到边缘自动滚动。
`core/mapping.ts` 的 `movePair(from, to)` 正好是配套的纯函数，搬过来即可用。

**因此不需要为 JIG 开任何拖拽白名单** —— 这比「开例外」干净。

### 8.4 本项目可复用 UI 组件清单

盘点本项目 `src/components/ui/`（12 个 shadcn 组件）与 `src/components/`（18 个业务组件），
按「直接能用 / 要改造 / 要新建」三档归类。

#### 一档：直接能用（零改动）

| 组件 | JIG 里对应什么 | 备注 |
|---|---|---|
| `ui/button.tsx` | 载入 / 导出 / 浏览 / 型号尺寸匹配 / 清空 | 6 变体 × 8 尺寸；`variant="destructive"` 给「清空」，`size="icon-sm"` 给表格行内按钮 |
| `ui/dialog.tsx` | 型号尺寸映射面板、JIG 设置面板 | Radix；含 `DialogHeader/Footer/Title/Description`，`showCloseButton` 可关 |
| `ui/input.tsx` | 映射表的「型号」「对应尺寸」输入 | 原生 input + 令牌底色 |
| `ui/select.tsx` + `components/Select.tsx` | 显示范围下拉、可用性筛选、P/N 过滤 | **优先用 `components/Select.tsx`**（本项目封装：分 groups、`lazyOptions`），而不是裸 `ui/select` |
| `ui/tabs.tsx` | 页内四视图切换 | 已定的「1 入口 + 页内 Tabs」现成的 |
| `ui/table.tsx` | 表格骨架 | `<table>` 语义 + `TableHead/Cell/Row`，配 `position: sticky` 固定首列 |
| `ui/popover.tsx` | 工序某道的悬浮详情、列头释义 | |
| `ui/tooltip.tsx` | 源文件完整路径、列名释义 | 侧栏菜单已在用 |
| `ui/separator.tsx` | 工具条内部分隔 | |
| `ui/skeleton.tsx` | 读文件期间的加载占位 | |
| `ui/sonner.tsx` + `hooks/useToasts.ts` | 全部提示 | `info/warning/error/sticky/update` 语义齐全，**不要另写一套** |
| `components/ScrollOverlay.tsx` | 表格区覆盖式滚动条 | **原项目 `OverlayScrollbar.tsx`(240 行) 整份丢掉** —— 本项目这个已是同类实现，且已接管 `.canvas` / `.canvas-flow` / `.dialog` |
| `hooks/useDismissOnBack.ts` | 弹层按系统返回键关闭 | Android 返回键行为，JIG 面板直接挂上 |

#### 二档：要改造复用

| 目标 | 改造点 |
|---|---|
| `.segmented` 分段控件 | 矩阵「按班次/按姓名」、设置三态在用。JIG 的「显示范围」是**下拉**（选项随数据变）→ 用 `Select`；「可用性筛选」是**三态分段** → 用 `.segmented` |
| `.field` / `.field-label` / `.field-note` | `settings.scss` 的表单字段三件套，映射表与设置面板直接套 |
| `.card-surface` | 卡片材质（底色 + 1px 边 + 圆角） |
| `.empty` / `.empty-title` / `.empty-text` | 空态盒（内凹浅槽，不用虚线框）。JIG 四视图都有空态，直接套这三个类 |
| `.settings-section` / `.settings-label` / `.settings-panel` | 「标题 + 竖条 + 右面板」布局骨架；竖条颜色已统一为 `--accent` |
| `MemberRowsEditor` 的 pointer 拖拽 | 映射表排序方案：手柄 `⠿` + `setPointerCapture` + 固定步长 + 边缘自动滚动，整段可抽成通用 hook |
| `DayEditor` 的弹层结构 | 「标题 + tab 条 + 内容页 + 底部按钮条 + 固定总高」范式，JIG 页内 Tabs + 工具条照此 |
| `useSidebarWidth` 的持久化模式 | JIG 的 5 个本机偏好键照它写（`clamp` + 停手 150ms 写盘） |

#### 三档：要新建

| 新建 | 为什么 |
|---|---|
| `JigTable` | 原项目 `Grid.tsx`(538 行) 是自绘虚拟表格。本项目用 `ui/table.tsx` + sticky 首列 + 小计/总计分色即可；不需虚拟滚动（上限 800 行） |
| `JigStageRail` | 工序轨道条形图（原 84 行），用 `stats.scss` 的 `.ot-bar` 样式重画 |
| `JigSourceBar` | 源文件路径条 —— 本项目 `TopBar` 是月份导航，语义不同，JIG 要自己的 |
| `JigQueryPanel` | 左栏输入区（JIG ID 多行输入 + 粘贴提取 + 开始查询） |
| `JigToolbar` | 各视图操作条（显示范围 / 可用性 / 导出 / 下钻面包屑） |
| `JigSizeMappingDialog` | 映射表维护弹层 |
| `jig.scss` | 只消费本项目令牌，不引新色 |

#### 四个「不搬」的原项目文件

| 原文件 | 处置 |
|---|---|
| `ui/OverlayScrollbar.tsx` (240) | 用本项目 `ScrollOverlay.tsx` 替代 |
| `ui/Grid.tsx` (538) | 用 `ui/table.tsx` 重做 |
| `styles/app.css` (1565) | 新写 `jig.scss` |
| `ui/SettingsDialog.tsx` / `SizeMappingDialog.tsx` (339+277) | 用 `ui/dialog` + `ui/input` + `.field` 重组 |

#### 一处要借用的既有经验：固定总高

原项目 JIG 的弹层是自己一套三段布局，尺寸写死在 `app.css` 里。本项目没有这个问题，
但 JIG 有一个真实需求：**四视图切换时弹层总高不变**（否则会「跳一下」）。

本项目 2026-11 已在 `schedule.scss` 处理过同一类问题（`--day-content-height` 按实机两页总高反推）。
JIG 若要做固定高度，**用同一套办法**：按容器宽度算出一档高度，不手算。

#### 8.5 工序轨道

11 道工序横排条形图，用透视表「总计」行的计数归一化。这是 JIG 领域独有的信息表达（原项目专门写了注释说「这是这个领域独有的信息」），值得保留原意，用本项目统计卡样式重画。

---

## 九、实施顺序

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P1** ✅ | `features/jig/core/` 整包平移 + 测试搬入 | ✅ 已完成，见下 |
| **P2** ✅ | 侧栏入口 + 路由 + 顶栏/画布骨架（空页） | ✅ 已完成，见下 |
| **P3** ✅ | 源文件选择 + 读取 + 查询结果视图 + 粘贴提取 | ✅ 已完成，见下 |
| **P4** ✅ | 全量透视 + 工序轨道 + 显示范围/可用性筛选 | ✅ 已完成，见下 |
| **P5** ✅ | 结果透视 + 下钻 | ✅ 已完成，见下 |
| **P6** ✅ | 数据审查 + 导出（含红色标记） | ✅ 已完成，见下 |
| **P7** ✅ | 型号尺寸映射维护 + 设置 | ✅ 已完成，见下 |
| **P8** | 配置拆分（备份 v6 / localStorage）+ 文档同步 | 备份往返、跨机器一致 |

**P1 的价值**：整包平移业务逻辑并跑通原测试，是风险最低、收益最高的一步 —— 后面每一步的数值正确性都有原项目测试做基准。

---

### P2 完成情况（2026-11-09）

**做了什么**

| 项 | 内容 |
|---|---|
| 路由 | `Route` 扩为 `matrix / overview / jig / settings`；解析与生成抽到 `src/appLocation.ts`（新增），`App.tsx` 只管用 |
| hash | JIG 走 `#/jig/<子页>`，**不带月份前缀**；`#/2026-10/jig/pivot` 里的月份被忽略 |
| 侧栏 | 新增「车间数据」组下的「JIG 数据」入口，**只在 Tauri 壳里渲染**（`isTauriShell()`） |
| 顶栏 | JIG 页换成 `JigTopBar`：源文件位置 + 导出 + 型号尺寸匹配 + 主题按钮；**没有月份导航**（对 JIG 无意义） |
| 画布 | `.canvas.is-jig`，与另三页同一档版心 1228 居中；页内四段用本项目 `ui/tabs.tsx` |
| 静态版兜底 | 非 Tauri 环境收到 `#/jig` 时回落到概览 —— 那一端既无侧栏入口也无文件能力 |
| 测试 | `src/appLocation.test.ts`（23 用例）：四页路由规则 + 解析/生成互逆 + 标题口径 |

**关键设计：JIG 与结算月解耦**

JIG 数据来自 MES 导出的 Excel，与哪个月份无关，所以：
- hash 不套月份前缀（`#/jig/pivot` 而不是 `#/2026-10/jig/pivot`）；
- 解析时若 hash 里带了月份，**忽略它**，不留在 JIG 页上；
- 顶栏不显示月份导航。

代价是「切到 JIG 再切回矩阵时月份还在不在」这件事不再由 hash 承载 ——
实测**月份仍保得住**（App 状态里留着 `location.month`，只是 JIG 页不写进 URL）。

**实机验收（Tauri 壳，已授权）**

| 项 | 结果 |
|---|---|
| 侧栏分组 | `视图: [matrix, overview]` + `车间数据: [jig]` ✓ |
| 侧栏点 JIG | hash `#/jig/detail`，标题「JIG 数据」，选中「查询结果」 ✓ |
| 四段页签 | `#/jig/query-pivot` / `#/jig/pivot` / `#/jig/review` / `#/jig/detail` ✓ |
| 刷新后 | 仍停在 `#/jig/pivot`、选中「全量透视」 ✓ |
| 顶栏 | JIG 页无月份导航、有「导出 / 型号尺寸匹配」；概览页仍是月份导航 + 备份 ✓ |
| 跨页月份 | 翻到 2026-10 → 进 JIG → 回矩阵得 `#/2026-10/matrix` ✓ |
| 静态版 | 侧栏无 JIG 入口；`#/jig/pivot` 回落概览；窄屏底栏无 JIG ✓ |

**两个环境坑（不是代码问题，但下次还会撞）**

1. **Radix Tabs 用 `onMouseDown` 切换，不是 `onClick`** —— 测试里 `element.click()` 点了没反应，
   必须发真实鼠标事件（`Input.dispatchMouseEvent`）。第一轮误判成「页签不工作」。
2. **单实例插件会让新起的 exe 立刻退出（code=0）** —— 系统里有个残留的
   `shift-schedule-desktop.exe`（debug 版）时，release exe 会把参数交给它然后退出，
   表现是「CDP 连不上」。实测前先 `Get-CimInstance Win32_Process` 查一下。

**验收**：`pnpm build`(tsc) / `pnpm test`(461) / `pnpm verify:dist`(77/112，基线一致) 通过。

---

### P1 完成情况（2026-11-09）

**做了什么**

| 项 | 结果 |
|---|---|
| 目录 | `src/features/jig/core/`（9 个文件）+ `src/features/jig/__tests__/`（11 个测试 + 夹具） |
| 平移方式 | 8 个文件**逐字节原样搬**（`table` / `query` / `pivot` / `validate` / `mapping` / `review` / `clipboard` / `excel`），只把 `AppConfig` 改成 `JigConfig` |
| 唯一重写的文件 | `config.ts` —— 原项目把业务配置 / 本机偏好 / 窗口托盘主题三类塞在一个接口里，这里拆成 `JigConfig`（业务，进备份）+ `JigPrefs`（本机，进 localStorage）；窗口 / 托盘 / 主题字段**不搬**（本项目已有自己的一套） |
| 新依赖 | `xlsx-js-style@1.2.0`（带样式导出用；P1 阶段被 tree-shaking 移出产物，体积不变） |
| 测试 | 原 11 个测试文件全绿 + **500 行真实 MES 夹具测试**（25 用例，含逐行红绿契约与装载约束） |

**交叉验证（最有说服力的一项）**

用同一份 500 行真实 MES 导出数据（`test-500.xlsx`），**同时加载原项目代码与移植后代码**跑一遍，
比对 12 项输出：

| # | 验证项 | 结果 |
|---|---|---|
| 1 | 业务配置默认值（19 个字段逐个） | 完全一致 |
| 2 | 全量透视表（14 列 × 33 行） | 逐字节一致 |
| 3 | 生产中透视 | 一致 |
| 4 | 明细表 | 一致 |
| 5 | 审查数据 | 一致 |
| 6 | 查询左连接（32 个 ID，含 2 个未命中） | 一致 |
| 7 | 尺寸校验逐行（500 行，200 行标红） | 0 处不一致 |
| 8 | 透视下钻 | 一致 |
| 9 | 审查分类（180 行不匹配） | 一致 |
| 10 | 可用性筛选与计数（390 / 110） | 一致 |
| 11 | 剪贴板提取（5 个样本） | 一致 |
| 12 | 映射表（16 对） | 一致 |

**一个真实问题**：平移后首轮测试有 2 个失败 —— 旧应用偏好字段名是
`default_file_dialog_path` / `table_default_row_height`，我改名成 `sourceDir` / `rowHeight` 后
snake_case 转换对不上。补了 `LEGACY_PREF_KEYS` 别名映射（只列改名的那几个），
业务字段本来就同名同义、snake_case 直接就读得懂。

**产物影响**：`dist/assets/app-*.js` 1,233.23 kB / gzip 408.86 kB，与改动前一致 ——
P1 阶段 core 未被界面引用，被 tree-shaking 整个移除，`xlsx-js-style` 也没进包。
P2 接入界面后它会进来（届时按方案 §7.1 用动态 `import()` 隔离）。

---

### P3 完成情况（2026-11-09）

**做了什么**

| 项 | 内容 |
|---|---|
| 壳内新命令 | `read_picked_file(path)` 读一个已存在的文件；`read_clipboard_text(app)` 读系统剪贴板文本 |
| 新插件 | `tauri-plugin-clipboard-manager`（读剪贴板）；能力面只开 `clipboard-manager:allow-read-text` |
| 平台层 | `src/platform/tauri.ts`（`window.__TAURI__` 的**唯一**类型声明，从 `backupDir.ts` 抽出来共用）、`src/platform/jigFile.ts`（选文件 / 读文件 / 读剪贴板） |
| 数据状态 | `src/features/jig/hooks/useJigData.ts` —— 源数据在内存、四个视图共享同一份源数据 |
| 界面 | `JigTable.tsx`（表格，含小计 / 总计 / 标红三种行）、`JigQueryPanel.tsx`（ID 输入 + 粘贴提取）、`styles/jig.scss` |

**为什么不用 fs 插件读文件**

`capabilities/default.json` 里 fs 的读权限被刻意限制在 `$DOWNLOAD` / `$DOCUMENT`，
而 MES 导出的文件通常在 D 盘、桌面或车间共享盘里。为了读这一个文件把 fs 放开到 `**`
并不划算 —— 自定义命令的能力面窄得多：**只读一个已存在的文件**，不遍历目录、不读目录列表、不写、不删。

**为什么剪贴板必须用插件**

「从邮件正文直接粘贴」读的是系统级剪贴板。WebView2 里 `navigator.clipboard.readText`
在 `onPaste` 事件中基本必被拒绝（需要额外的用户激活与权限）—— 只有插件能拿到真正的系统剪贴板。

**实机验收（release exe + CDP，探针 `scripts/probe/jig-shell.mjs`，16/16 通过）**

| 项 | 结果 |
|---|---|
| 壳注入 | `window.__TAURI__.core.invoke` 可用 ✓ |
| 读剪贴板 | 返回字符串 ✓ |
| 读 MES Excel | 44,783 字节，头是 `PK\x03\x04` ✓ |
| 错误路径 | 读不存在的文件报错「文件不存在：…」 ✓ |
| JIG 页面 | 标题「JIG 数据」、四个页签、「浏览…」可用、输入框在 ✓ |
| 切页签 | query-pivot / pivot / review 三个都切得动 ✓ |
| **端到端** | 选文件 → 读 → 解析 → 出表：**33 行 × 14 列**（与 P1 交叉验证基线一致）✓ |
| 查询链路 | 查 3 个 ID → 3 行；不存在的 ID 标【未找到】 ✓ |
| 粘贴提取 | 从邮件正文里挑出 2 个 Jig ID，正文未混入 ✓ |

**一个真实缺陷（已修）**

最初 `onPaste` 无条件 `preventDefault()` 再去读剪贴板。**在浏览器 / 静态版里没有剪贴板插件**，
读取必然失败 —— 结果是「粘贴键完全没用」，而且还弹一句错误。改成**先探测能不能读，读得到才拦默认粘贴**；
读不到就放行让浏览器自己粘原文，并提示一句「已按原文粘贴」。

**三个环境坑**

1. **`cargo build --release` 出来的 exe 连的是 devUrl，不是打包好的前端** ——
   `custom-protocol` feature 只在 `tauri build` 时才带上。直接 cargo 构建的 exe 启动后
   打开的是 `chrome-error://chromewebdata/`（127.0.0.1 拒绝连接）。
   要用 `pnpm exec tauri build --config desktop/src-tauri/tauri.conf.json --no-bundle`。
2. **全新用户数据目录会停在三步向导上**，JIG 页面根本进不去 ——
   探针要先往 localStorage 塞一份最小花名册（`shift-schedule:local:roster:v2`）。
3. **CDP 的 `Runtime.evaluate` 返回值在 `result.result.value`**，而本项目的
   `cdp.mjs` 已经包了一层 `evaluate()`，直接用包装版，别自己再取一层。
4. **单实例插件会让残留进程挡住新起的 exe** —— 上一次探针没杀干净，
   新 exe 把参数交给它然后自己退出，表现是「CDP 连不上」。测前先
   `Get-Process shift-schedule-desktop | Stop-Process -Force`。

---

### P4 完成情况（2026-11-09）

**做了什么**

| 项 | 内容 |
|---|---|
| `core/active.ts` | `filterActive` —— 按「Jig状态 == INPRODUCTION」过滤源行。**源表没有状态列时不过滤**（硬筛会把数据清空） |
| `core/pivotScope.ts` | 「显示范围 + 可用性筛选 → 透视表 / 计数 / P/N 候选」整条链路的纯函数 |
| `JigStageRail.tsx` | 工序轨道：11 道工序横排，计数取自透视表「总计」行 |
| `JigPivotToolbar.tsx` | 显示范围下拉 + 可用性三态分段（带计数） |
| `jig.scss` | 轨道与工具条的样式，全部走本项目令牌 |
| `pivotScope.test.ts` | 16 个用例锁口径 |

**为什么把逻辑从 App.tsx 收进 core**

原项目把「显示范围」「可用性筛选」「透视表」「计数」「P/N 候选」写成五个 useMemo
散在 App.tsx 里。本项目收成一个纯函数 `computePivotScope`，三个理由：

1. 口径必须与原项目逐值一致 —— 分段按钮上的数字得等于透视表总计行的和；
2. 可交叉验证 —— 纯函数能被原项目与移植后的代码同时调用、逐值比对；
3. 组件只管渲染，App.tsx 已经够长了。

**显示范围是一个下拉而不是两个控件**

P/N 与「全部/生产中」共用同一个下拉框。选某个 P/N 时**不再叠加**「生产中」筛选 ——
两个条件互斥却挤在一个单选框里，用户会判断不出当前生效了哪个。

**P/N 候选项不受当前范围影响**

候选项取自**全部范围**的透视表小计行。否则选了某个 P/N 之后，下拉里就只剩那一个，
其它型号再也选不回来了。

**交叉验证（`scripts/probe/jig-cross-p4.mjs`，全部一致）**

用同一份 500 行真实 MES 夹具，同时加载原项目 `src/core` 与移植后的
`src/features/jig/core`，比对：

| # | 验证项 | 结果 |
|---|---|---|
| 1 | 总行数 / 生产中行数 | 500 / 450，一致 |
| 2 | P/N 候选列表 | 6 个，一致 |
| 3 | **24 组「显示范围 × 可用性档」的透视表**（列、逐行、计数） | 逐值一致，0 组不一致 |
| 4 | 8 个范围的工序轨道计数 | 逐项一致，0 处不一致 |

脚本用 esbuild 打包两边的 core 各跑一次（`vite-node` 本项目没装），
**夹具只读一次**，两边拿到的输入逐字节相同。

**一个真实缺陷（已修）**

`computePivotScope` 最初返回的 `rows` 是「按 P/N 与可用性筛过的行」，
**没走生产中筛选** —— 而透视表内部会做同一套预处理。两者本该相等，
选「生产中」范围时却不等。修法是对 `baseRows` 再走一遍 `preparePivotRows`
（幂等：已回填的 CST、已筛过的行再筛一遍结果不变），返回值与表格口径对齐了。

**实机验收（release exe + CDP，探针 `scripts/probe/jig-shell.mjs`，23/23 通过）**

| 项 | 结果 |
|---|---|
| 工序轨道 | 11 道工序，顺序 PNP → Jig入库 ✓ |
| 轨道 vs 表 | 轨道上 11 道的计数与透视表「总计」行**逐项一致** ✓ |
| 可用性三档 | 计数 450 / 351 / 99，与交叉验证基线吻合 ✓ |
| 切「可用」 | 表 33 行 → 27 行、表头 14 列 → 8 列（只剩五道可用工序）✓ |
| 切回「全部」 | 行数复原 33 ✓ |

---

### P5 完成情况（2026-11-09）

**做了什么**

| 项 | 内容 |
|---|---|
| `core/drill.ts` | `openDrill`（点格子 → 定位键 + 面包屑）、`resolvePivotPns`（还原每行所属 P/N）、`buildDrillTable`（定位键 → 明细表） |
| `JigDrillBar.tsx` | 下钻面包屑条：「← 返回」+ 路径 + 条数 + 尺寸不匹配行数 |
| `useJigData` | 下钻状态、`drillTo` / `exitDrill`、查询命中行快照 |
| `JigScreen` | 下钻时让位给面包屑条，表格换成明细表；透视表计数格可点 |
| `drillScope.test.ts` | 14 个用例锁口径 |

**下钻是什么**

透视表每一格是一个计数（「这个 P/N 的这块板，有 18 块走到 PNP 这道工序」）。
点这个数字，看到的就是**构成这个数字的那些源行**。定位一个格子要三个键：
`pn`（型号）、`cst`（板）、`eng`（工序），三者都缺省表示「全表」。

**一处容易错的地方**

透视表里**明细行的 P/N 是空串**（视觉上属于上方的小计行），总计行的 P/N 写「总计」。
两者都不能直接当筛选条件用 —— 直接读 `row['P/N']` 会得到「明细行全都变成空 P/N」。
必须沿小计行上溯（`resolvePivotPns`）把每一行还原成它真正所属的型号。

**交叉验证（`scripts/probe/jig-cross-p5.mjs`，全部一致）**

P1 已验证过 `drillPivotRows`（逐字节平移）。P5 新写的是**点格子 → 推出定位键与面包屑**
这段逻辑，用同一份 500 行夹具、同一张透视表（33 行 × 14 列），
对**每一个格子**点一遍，两边比对：

| # | 验证项 | 结果 |
|---|---|---|
| 1 | 透视表行列数 | 33×14，一致 |
| 2 | **462 个格子的 `{pn, cst, eng}` 与面包屑** | 逐格一致，0 处不一致 |

面包屑抽样：
```
全量透视 › 6072J-7748B › 全部 CST › P/N
全量透视 › 6073J-6555B › D8CCST500013 › Jig N判定 另外移载
全量透视 › 全表
```

**脚本的一个技术要点**

原项目那边没有 `core/drill.ts`（它的下钻逻辑在 App.tsx 里），所以脚本分成
**两个模板**：原项目侧逐字复刻 App.tsx 的 `openDrill` + `resolvePivotPns`，
移植后侧直接调 `core/drill.ts`。这样比的是「两边各自的逻辑产出」，
而不是同一份代码自比。

另外 esbuild 会静态解析所有 import —— 原项目侧若写成字面量
`import('.../drill.ts')` 会直接报「无法解析」。所以模板必须分开。

**两个设计决定**

1. **下钻明细默认标出尺寸不匹配**，不跟随查询结果页的开关 ——
   这一页就是用来核对下钻结果的，用户没勾选时看到的是一片「全部匹配」，容易误判。
2. **切页时清掉下钻**（原项目也是切 tab 就 `setDrill(null)`）。
   只靠「视觉上退出」不够：切走再切回来下钻还在，但期间源数据可能已变，
   底稿与定位键对不上，会出现「明细行数与格子上的数字不一致」。

---

### P6 完成情况（2026-11-09）

**做了什么**

| 项 | 内容 |
|---|---|
| `core/reviewView.ts` | 审查页的 P/N 过滤、两档视野、两档计数 |
| `core/export.ts` | 导出目标的挑选（下钻 / 各页签各走一条） |
| `JigReviewToolbar.tsx` | 审查页工具条：P/N 下拉 + 两档分段（带计数） |
| `platform/jigExport.ts` | 「另存为」对话框 + 落盘 + 文件名处理 + 记住导出目录 |
| Rust `save_jig_export` | 把二进制写进用户选定的路径 |
| `jigExport.test.ts` / `reviewView.test.ts` | 6 + 14 个用例 |

**导出跟着「看到的」走**

下钻时页签仍是透视页，但用户看到的是明细 —— 导出必须跟着看到的内容走，
否则「导出全量透视」会导出看不见的表。同理，审查页切到「尺寸不匹配」
后导出，拿到的就是一张纯异常清单。

**红字只落在需要的地方**

尺寸不匹配的红色标记只在**查询结果页**、**审查页**、**下钻明细**写入，
沿用旧版 `main_window.py` 里 `apply_style` 的判定条件。透视表与结果透视不标 ——
那些格子里是计数，没有「对应尺寸」列可标。

**新命令 `save_jig_export`**

能力面与 `save_backup_to` 对称：**只写用户自己指定的那一个文件**，
不遍历目录、不写别处、不删。不用 fs 插件是因为它的写权限被刻意限制在
`$DOWNLOAD` / `$DOCUMENT`，而用户可能要把报告存到 D 盘或共享盘。

**交叉验证（`scripts/probe/jig-cross-p6.mjs`，全部一致）**

| # | 验证项 | 结果 |
|---|---|---|
| 1 | 审查页 P/N 候选 | 6 个，一致 |
| 2 | **14 组「P/N × 档位」的表、计数、标红标记** | 逐值一致，0 组不一致 |
| 3 | **导出文件里的红字位置**（解包 styles.xml + sheet1.xml 比对） | 两档各 180 个红字单元格，位置与颜色（FFFF0000）完全一致 |

**脚本的一个技术要点**

解包 xlsx 时不能靠 xlsx 读回 —— `xlsx-js-style` 读文件时不还原 `font.color`，
会把有样式的单元格误报成无样式。必须直接看 `styles.xml` 的字体色与
`sheet1.xml` 里每个单元格的样式索引。

另外 `xlsx-js-style` 是 CJS，bundle 成 ESM 时它内部的 `require('stream')` 会炸，
要给 bundle 注入一个基于 `createRequire` 的 require。

**实机验收（release exe + CDP，探针 `scripts/probe/jig-export.mjs`，11/11 通过）**

| 项 | 结果 |
|---|---|
| 审查页出表 | 450 行 ✓ |
| 工具条 | P/N 下拉在、两档分段带计数 450 / 180 ✓ |
| 切「尺寸不匹配」 | 450 → 180 行；切回复原 ✓ |
| 导出落盘 | 209,023 字节 ✓ |
| 导出文件红字 | 180 个单元格，纯红 FFFF0000，落在「对应尺寸」列 ✓ |
| 记住导出目录 | 写进 localStorage ✓ |

---

### P7 完成情况（2026-11-09）

**做了什么**

| 项 | 内容 |
|---|---|
| `JigSizeMappingDialog.tsx` | 型号尺寸映射维护面板（增删改、上下移、pointer 拖拽、校验） |
| `JigSettingsDialog.tsx` | JIG 设置：源目录、导出目录、行高、粘贴开关、时间戳开关 |
| `platform/jigFile.ts` | 新增 `pickJigDirectory`（选目录） |
| `useJigData` | 四张表改成**派生**计算；本机偏好由 state 持有 |
| `mappingRecalc.test.ts` | 5 个用例锁「映射改动后重算」 |

**核心：映射改动后所有视图即时更新**

实现方式是**把表从「存起来」改成「派生出来」**：

| 原来 | 现在 |
|---|---|
| `tables.review` 加载时算一次存 state | `reviewAllTable` 由 `processSourceData(source.rows, config)` 派生 |
| `tables.detail` 查询时算一次存 state | `detailTable` 由 `queryData(source.rows, queryIds, config)` 派生 |
| 只存「上次查的 ID」 | 派生链：`源数据 + 配置 → 表` |

**为什么必须这样**：存成 state 的话，改完映射界面上的「对应尺寸」列还是旧值，
用户会以为保存没生效；**导出的文件里也是旧值，拿去做尺寸核对会得出错误结论**。

**映射排序用 pointer events，不用 HTML5 drag**

本项目上一轮已全局禁用 HTML5 原生拖拽（`main.tsx` 在 document 捕获阶段取消
`dragstart`）。但那套屏蔽只管 HTML5 drag —— 成员表的排序走的是
pointer events + `setPointerCapture`，与 HTML5 drag 是两套机制，不受影响。
映射表沿用同一套（手柄 `⠿` + 固定步长 52 + 拖到边缘自动滚），
**因此不需要为 JIG 开任何拖拽白名单** —— 这比「开例外」干净。

**「恢复默认」恢复的是内置默认表，不是当前配置**

一开始传的是 `config.jigSizeMapping`，结果是：用户改完规则保存，下次打开面板点
「恢复默认」，拿回的正是他自己刚存的那份 —— 按钮看着有反应，但什么也没恢复。
默认表是代码里的 `createDefaultJigConfig()`，不会被用户配置污染。

**JIG 设置独立于排班的设置页**

两套业务的设置项完全不同（这边是 MES 文件的目录、行高、粘贴开关；
那边是成员名单、薪资、备份）。混在一个页面里谁都不好找。
这一屏全是**本机偏好**，不进备份文件 —— 换个机器就该按新机器的情况重设。

**一个测试上的坑**

尺寸的写法是「宽/高」（如 `77/48`），不是 4 位数字。`parseSizeCodes` 按组拆，
每组去掉非数字后必须**恰好 4 位**才成码 —— 写 `7748/7748` 会得到 8 位，
不成码，于是判定恒为「不匹配」。另外 P/N 长度必须够（默认第 7 位起取 4 位），
不够会被判成「无法验证 → 视为匹配」，标红判定就不会有任何变化。

**实机验收（release exe + CDP，探针 `scripts/probe/jig-mapping.mjs`，13/13 通过）**

| 项 | 结果 |
|---|---|
| 审查页基线 | 450 行，180 行标红 ✓ |
| 映射面板 | 打开；16 行、32 个输入框、16 个拖拽手柄 ✓ |
| 改映射并保存 | 面板关闭 ✓ |
| **「对应尺寸」列重算** | 36 行的对应尺寸变成新值 ✓ |
| **标红重算** | 180 → 198 行 ✓ |
| 审查页两档计数 | 450 / 198 ✓ |
| 其它视图 | 透视表 33 行、工序轨道 11 道，仍正常 ✓ |

---

## 十、风险与已知取舍

| 项 | 说明 |
|---|---|
| 备份版本跳 6 | v5 备份文件按本项目既有策略报「版本不对，请重新导出」。这是既有决策（开发期无真实用户），但用户若有在用的备份会失效 |
| `xlsx-js-style` 是社区 fork | SheetJS 社区版不做样式，标红只能靠这个 fork。有维护停滞风险（当前最后更新较久）。若风险不可接受，退路是「导出额外一列标记」 |
| 表格无虚拟滚动 | 800 行以内可接受；若现场数据超出 800 位（JIG 位上限），需要改虚拟滚动 |
| JIG 页只在桌面壳可用 | web 静态版与小程序端无 JIG 入口，跨端用户需装桌面版 |
| 原项目 UI 不搬 | 「查不到某个交互细节」的风险 —— 移植时需逐条比对原项目行为，必要时回看原源码 |

---

## 十一、已确认的交互细节（补录）

| 项 | 决定 |
|---|---|
| 映射表排序 | pointer events 拖拽（复用人员配置方案），**不开 HTML5 drag 白名单** |
| 备份里的 JIG 段 | **固定包含**，导出时不给选项 |
| 源文件默认目录 | **记住**（localStorage，本机偏好） |
| 应用定位 / 品牌 | **最后再定**。本阶段不动产品名、图标、描述、`tauri.conf.json` 的 copyright |

## 十二、下一阶段建议

按 §9 的 P1 → P8 推进。**P1（业务逻辑整包平移 + 测试跑绿）建议单独起一轮**：
它零 UI 改动、零新依赖，风险最低，且后续每一步的数值正确性都有原项目 11 个测试文件做基准。

进入 P1 之前需要确认的一点：`src/features/jig/core/` 的目录名是否合适，
以及 `core/config.ts` 拆分时，具体哪些字段算「业务配置」、哪些算「本机偏好」——
§6 已给出建议清单，实际拆分时按那份清单切。
