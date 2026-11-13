# Tauri 桌面版

把同一份 `src/` 装进一个原生窗口，产出可双击安装的 Windows 程序。
壳本身不含任何业务逻辑：班序展开、成员与改班记录都在上一级的 `src/data/`
（纯 TS + 单测），这里只负责开窗口、挂资源。

## 两条产物线并存

|  | 静态版 | 桌面版 |
|---|---|---|
| 前端配置 | `../vite.config.ts` | `vite.config.ts`（本目录） |
| 前端产物 | `dist/` | `dist-tauri/` |
| 源码根 | `../src` | 同一份 `../src` |
| dev 端口 | **6180**（`../scripts/dev.mjs`） | **6182**（`tauri dev` 自动起） |
| 外壳 | 无（浏览器打开） | `src-tauri/` |
| Service Worker | 有（PWA / 离线缓存） | **无**（构建时摘掉） |
| 打包物 | 文件夹 → zip | NSIS 安装包 |
| 命令 | `pnpm dev` / `pnpm build` | `pnpm desktop:dev` / `pnpm desktop:build` |

改一次业务代码，两条线都能出，互不覆盖。

面向最终用户的两份说明由 `docs/使用说明模板.txt` 生成（`pnpm guides`）：
静态版输出到 `public/使用说明.txt`，绿色版输出到本目录的 `绿色版使用说明.txt`，
只维护模板即可。

**单实例**：壳里注册了 `tauri-plugin-single-instance`。重复双击 exe 不会开第二个进程，
新进程把参数交给已有实例后立即退出，已有窗口会从最小化 / 托盘隐藏状态唤回前台。

## 命令

```bash
pnpm desktop:dev     # 起 vite(6182) + 开壳窗口，HMR 生效
pnpm desktop:build   # 出安装包（⚠ 需先设代理，见「已知问题」）
```

不想开终端就**双击上一级目录的 `tauri-dev.bat`**，等价于 `pnpm desktop:dev`。
它会先检查 node 与本地 Tauri CLI，再起壳；首次编译 Rust 约 1–3 分钟，
之后增量约 10–40 秒。

**`desktop:dev` 不要先起 6180**：它自己通过 `beforeDevCommand` 起 6182 的 vite，
再由壳加载 `http://127.0.0.1:6182/index.html`。两个 dev server 可以同时开着
（端口错开），改代码两边都热更——需要对比「浏览器 / 壳内」表现时很方便。

改 `tauri.conf.json`、`capabilities`、`vite.config.ts` 后必须重启 `desktop:dev`，
vite 的热更不覆盖这些文件。

## 前置条件

- Rust（cargo / rustc）+ Visual Studio 2022 Build Tools（MSVC）
- WebView2 Runtime（Win11 自带，Win10 可能需装）
- **cargo 默认不在 PATH 里**，若 `tauri info` 报 `rustc: not installed`：

```powershell
[Environment]::SetEnvironmentVariable('Path',
  "$([Environment]::GetEnvironmentVariable('Path','User'));$env:USERPROFILE\.cargo\bin", 'User')
```

新开一个终端即可生效。

## 窗口参数

| 项 | 值 | 理由 |
|---|---|---|
| 默认尺寸 | 1466 × 900 | 「全员矩阵」31 天横向铺满的参考宽度，**不是硬性下限** |
| 最小尺寸 | **1024 × 720** | 从 1466 放宽：web 端本来就不限制最小窗口，侧栏展开固定 224px、可折叠成 48px，固定 34px 的日期列装不下时矩阵自己横滚。侧栏在任何宽度都常驻、不收缩，取 1024 只是让 1024–1466 这段仍放得下日历 + 待办（再窄由容器查询拆单列）；高度 720 仍照顾 1366×768 办公屏 |
| `theme` | `Light`（仅初始值） | 只是**创建窗口时**的起点。应用默认浅色、不跟随系统；真正生效的主题由前端通过 `set_window_theme` 同步过来 |
| `backgroundColor` | `#ffffff` | 应用默认浅色，窗口创建到首帧之间的底色取画布白。旧值 `#0e2228` 是改造前深青 L 形外壳的颜色，留在浅色窗口上会在启动 / 缩放时露一道深青边 |
| `decorations` | `false` | 无边框窗口：标题栏由前端自绘，侧栏才通得到窗口顶。阴影与 Win11 圆角仍由系统画（`shadow` 默认 `true`），贴靠与边缘缩放保持系统行为 |
| 标题栏 | **前端自绘**，32px | `src/components/TitleBar.tsx` 把标题栏拆成两半：侧栏第一行是折叠 / 展开按钮 + 拖动区（放大的品牌字标压在下面的 `.brand-hero`；顶栏那份折叠按钮在壳内不渲染，避免重复），`SidebarInset` 第一行只放最小化 / 最大化 / 关闭（页名交给系统窗口标题，不在标题栏重复）。整条标题栏与侧栏同底色、不画分隔线；下面接一块左上角圆角的 `.canvas-layer`，与侧栏 / 缝隙形成三层色差（`--ui-sidebar` / `--layer-canvas` / `--layer-gap`）。`data-tauri-drag-region` 负责拖动，双击调 `toggleMaximize`，`close()` 照常触发 `CloseRequested` 走托盘偏好。`paint_caption` 只保留 immersive dark mode 与边框色，caption 已无可见对象。不提供 Alt+Space 系统菜单 |

### 主题同步链路

```
index.html 首帧脚本            ← 防深色用户先闪一帧浅色窗口底色
src/platform/theme.ts applyTheme ← 顶栏切换 / 设置三态 / 跟随系统实时变化
        ↓ invoke("set_window_theme", { dark })
lib.rs：immersive dark + 边框色 + window.set_theme
```

静态版 / 浏览器里没有 `__TAURI__`，这两处调用直接跳过；老版本 exe 没有这个命令时
Promise 会 reject，被 `.catch` 吞掉，不影响页面。改完 Rust 或 `tauri.conf.json`
必须重启 `desktop:dev` / 重新打包，vite 热更不覆盖这些文件。

## 托盘与关闭行为

- **托盘图标**：常驻任务栏通知区域，悬停提示「昼夜 · 个人倒班记录本」
- **左键单击**：显示主窗口、取消最小化并聚焦
- **右键菜单**：`显示 / 隐藏主窗口`、`退出`
- **关闭按钮**（含自绘标题栏的 ✕）：默认直接退出；设置 → 系统设置 → 窗口 可改为「隐藏到托盘」，
  前端通过自定义命令 `set_close_to_tray` 把偏好同步给 Rust，关闭时由 `on_window_event` 拦截
- 托盘依赖 `tauri` 的 `tray-icon` feature；改完 Rust 或能力配置后要重启 `desktop:dev` / 重新打包

## `devUrl` 为什么必须带 `/index.html`

`base: './'`，裸路径 `/` 会 404，`tauri dev` 就会一直打印
`Waiting for your frontend dev server to start`。

## 与静态版的三处配置差异

都在 `vite.config.ts` 里，理由写在注释中：

1. **输出到 `dist-tauri/`**，不碰 `dist/`。静态版的 dist 要打成 zip 分发，
   两条产物线必须互不覆盖。
2. **摘掉 Service Worker 与 webmanifest**。壳里的资源随安装包一起替换，
   不需要缓存层；留着反而是缓存优先，换版本后仍打开旧页面。
   `src/main.tsx` 里另有一道运行时判断（`__TAURI_INTERNALS__`），两处独立生效。
3. **不套 `fileProtocolFriendlyPlugin`**。那个插件把模块脚本降级成 `defer`
   是为了 `file://`；壳里走 `http://tauri.localhost`，模块脚本本来就正常。

## 数据

仍存在前端页面的 `localStorage`（键 `shift-schedule:local:roster:v2`），
落在 `%LOCALAPPDATA%\com.huawenda.shiftschedule\EBWebView\`。

- 关闭程序、重装、升级都保留
- Rust 侧**不碰任何排班数据**，壳只负责开窗口和挂资源
- ⚠️ **`identifier` 不能随意改**：它决定上面那个数据目录名，一改就等于换了个空库，
  用户会以为数据丢了。要改必须同时告诉使用者先导出备份。

## 备份：壳内已实测可用（2026-10-27）

release 版实测 31 项全通过，浏览器原生的两条路在 WebView2 里都能走；
另外「备份默认存放目录」只在这个壳里可用：

- **导出**：没设默认目录时点「导出备份」→ 浏览器下载到系统「下载」文件夹；
  设了默认目录则走原生目录选择器 + 自定义 `save_backup_to`，直接写进用户挑的文件夹
- **格式**：当前是 v5（成员 + 自建班序 + 改班/加班记录 + 待办 + 本人与薪资）
- **导入**：文件交给 `<input type=file>` 后，成员被替换、界面提示
  「已导入 2 位成员、1 条改班记录」
- **持久化**：改班 → 杀进程 → 重启，成员与改班记录都还在，没有退回向导

复跑命令：

```bash
pnpm verify:tauri    # = node scripts/verify-tauri-shell.mjs
```

它会用临时用户目录（`WEBVIEW2_USER_DATA_FOLDER`）起 release exe，
**不碰你真实的 `%LOCALAPPDATA%\com.huawenda.shiftschedule\EBWebView`**，
测完把临时目录删掉。加 `--keep` 可保留现场。

`tauri-plugin-dialog` 与 dialog 权限**已经在用**：设置页「备份默认存放目录」的
原生目录选择器。`tauri-plugin-fs` 与那两条 fs 权限仍未调用——写文件走自定义的
`save_backup_to` 命令（fs 的写权限被刻意限制在 `$DOWNLOAD` / `$DOCUMENT`，
而默认目录允许挑任意位置）。若长期不用，可以把 fs 插件与其权限删掉，权限面小一点更干净。

## 权限

`src-tauri/capabilities/default.json` 只开三样：`core:default`、
`dialog:allow-open` / `dialog:allow-save`，以及限定在 `$DOWNLOAD` / `$DOCUMENT`
的 `fs:allow-write-file` / `fs:allow-read-file`。

没有网络权限——应用本身不发任何请求。CSP 见 `tauri.conf.json` 的
`app.security.csp`，`default-src 'self'`，`style-src` 额外允许 `'unsafe-inline'`（React 内联样式需要）。

## 产物

- 可执行文件：`src-tauri/target/release/` 下，文件名取 `tauri.conf.json` 的
  `mainBinaryName`（当前是 `昼夜.exe`）
- 安装包：`src-tauri/target/release/bundle/nsis/昼夜_1.0.0_x64-setup.exe`

（包名由 `productName` + `version` 拼出，以实际产物为准。）

## 已知问题

**NSIS 打包需要联网下载 NSIS 运行时**，直连 GitHub 会超时（与 `git push` 同一个原因）。
构建前设一下代理：

```powershell
$env:HTTP_PROXY='http://127.0.0.1:7897'
$env:HTTPS_PROXY='http://127.0.0.1:7897'
```

**6182 是 `strictPort: true`**：上次 `desktop:dev` 没退干净会直接报端口占用，
不像 6180 那样自动顺延。手动结束遗留的 node 进程，或确认没有第二个 tauri dev 在跑。

**脚本现状**（`../scripts/`）：

| 脚本 | 状态 |
|---|---|
| `verify-tauri-shell.mjs` | ✅ 当前唯一有效的壳内验收（`pnpm verify:tauri`） |
| `verify-dist.mjs` | ✅ 静态版（浏览器）验收，不跑壳 |
| `shoot-showcase.mjs` | ✅ 产品展示图生成（`pnpm shoot:showcase`）：注入虚构样例 → 逐视图截 2 倍图 → 合成宣传板，输出到 `design/screenshots/` |
| `probe/measure-*.mjs` | 🔍 一次性界面测量探针（内容密度 / 纵向溢出 / 滚动条），偶发排查用，不挂命令、不参与验收 |
