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
| **P2** | 侧栏入口 + 路由 + 顶栏/画布骨架（空页） | 侧栏能进 JIG 页，Tabs 能切，hash 正确 |
| **P3** | 源文件选择 + 读取 + 查询结果视图 + 粘贴提取 | 能选文件、能查、能粘贴提取 ID |
| **P4** | 全量透视 + 工序轨道 + 显示范围/可用性筛选 | 与原项目数值一致（用同一份 fixture 交叉验证） |
| **P5** | 结果透视 + 下钻 | 下钻面包屑与原项目一致 |
| **P6** | 数据审查 + 导出（含红色标记） | 导出文件的红色标记与原项目一致 |
| **P7** | 型号尺寸映射维护 + 设置 | 映射改动后所有视图即时更新 |
| **P8** | 配置拆分（备份 v6 / localStorage）+ 文档同步 | 备份往返、跨机器一致 |

**P1 的价值**：整包平移业务逻辑并跑通原测试，是风险最低、收益最高的一步 —— 后面每一步的数值正确性都有原项目测试做基准。

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
