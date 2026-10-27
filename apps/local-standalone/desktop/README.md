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

## 窗口参数（对齐「只做大屏 PC」+「全站强制浅色」两条约束）

| 项 | 值 | 理由 |
|---|---|---|
| 默认尺寸 | 1440 × 900 | PRD 的基准屏 |
| 最小尺寸 | 1280 × 700 | 再窄矩阵列会压到 20px 以下，「特」字放不下；高度取 700 是为了 1366×768 的办公屏也放得下 |
| `theme` | **Light** | 页面本身是浅色。设成 Dark 会让标题栏和系统控件走暗色，在廉价办公屏上和内容打架——这条与全站浅色硬约束冲突，别改回去 |

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

**结论：不需要改成 Tauri 对话框。** release 版实测 31 项全通过，
浏览器原生的两条路在 WebView2 里都能走：

- **导出**：点「导出备份」→ 文件真的落盘，内容是正确的 v2 格式（3 人 + 1 条改班）
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

`tauri-plugin-dialog` / `tauri-plugin-fs` 与 `capabilities` 里的 dialog/fs 权限
**目前是未被调用的代码路径**——留着是因为成本为零，将来真要换成原生对话框
（比如加「另存为到指定目录」）可以直接用 `window.__TAURI__`（`withGlobalTauri` 已开，
不需要装 npm 包）。若长期不用，也可以把 `capabilities/default.json` 里那两条 fs 权限删掉，
权限面小一点更干净。

## 权限

`src-tauri/capabilities/default.json` 只开三样：`core:default`、
`dialog:allow-open` / `dialog:allow-save`，以及限定在 `$DOWNLOAD` / `$DOCUMENT`
的 `fs:allow-write-file` / `fs:allow-read-file`。

没有网络权限——应用本身不发任何请求。CSP 见 `tauri.conf.json` 的
`app.security.csp`，`default-src 'self'`，`style-src` 额外允许 `'unsafe-inline'`（React 内联样式需要）。

## 产物

- 可执行文件：`src-tauri/target/release/` 下，文件名取 `tauri.conf.json` 的
  `mainBinaryName`（当前是 `倒班表.exe`）
- 安装包：`src-tauri/target/release/bundle/nsis/倒班表_1.0.0_x64-setup.exe`

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
| `verify-tauri-storage.mjs` | ❌ 已被上面那个取代，校验的是 v1 的 `day-records:v1`/`settings:v1`，选择器含已删除的 `.stats`，可以删 |
| `verify-tauri-scrollbar.mjs`、`shot-tauri-overview.mjs` | ❌ 抓旧界面类名，失效 |
| `verify-dist.mjs` | ✅ 静态版（浏览器）验收，不跑壳 |
