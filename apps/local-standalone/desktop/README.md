# Tauri 桌面版

把同一份 `src/` 装进一个原生窗口，产出可双击安装的 Windows 程序。

## 两条产物线并存

|  | 静态版 | 桌面版 |
|---|---|---|
| 目录 | 仓库根 | `desktop/` |
| 前端产物 | `dist/` | `dist-tauri/` |
| 前端配置 | `vite.config.ts` | `desktop/vite.config.ts` |
| 外壳 | 无（浏览器打开） | `desktop/src-tauri/` |
| 打包物 | `dist/` 打成 zip | NSIS 安装包 |
| Service Worker | 有（PWA 安装用） | **无** |
| 打包命令 | `pnpm build` | `pnpm run desktop:build` |

两者共用 `src/`，互不覆盖。改一次业务代码，两边都能出。

## 命令

```bash
pnpm run desktop:dev     # 开发：起 vite(6182) + 开壳窗口，HMR 生效
pnpm run desktop:build   # 出安装包
```

产物：
- 可执行文件 `desktop/src-tauri/target/release/shift-schedule-desktop.exe`
- 安装包 `desktop/src-tauri/target/release/bundle/nsis/倒班表_1.0.0_x64-setup.exe`

## 前置条件

- Rust（cargo / rustc）+ Visual Studio 2022 Build Tools（MSVC）
- WebView2 Runtime（Win11 自带，Win10 可能需装）

**cargo 默认不在 PATH 里**，若 `tauri info` 报 `rustc: not installed`：

```powershell
[Environment]::SetEnvironmentVariable('Path',
  "$([Environment]::GetEnvironmentVariable('Path','User'));$env:USERPROFILE\.cargo\bin", 'User')
```

新开一个终端即可生效。

## 与静态版的三处差异

都在 `desktop/vite.config.ts` 里，理由写在注释中：

1. **输出到 `dist-tauri/`**，不碰 `dist/`。静态版的 dist 要打成 zip 分发。
2. **摘掉 Service Worker 与 webmanifest**。壳里的资源随程序安装、升级时整体替换，
   不需要缓存层；留着反而是缓存优先，换版本后仍打开旧页面。
3. **不套 `fileProtocolFriendlyPlugin`**。那个插件把模块脚本降级成 `defer`
   是为了 `file://`，壳里走 `http://tauri.localhost`，模块脚本本来就正常。

另有一处运行时判断在 `src/main.tsx`：Tauri 注入 `window.__TAURI_INTERNALS__`，
检测到就不注册 SW。用注入变量而不是域名判断——审计脚本也跑在 `127.0.0.1` 上，
按域名排除会连带关掉静态版的 SW。

## 数据

仍然存在前端页面的 `localStorage`（键 `shift-schedule:local:*`），
落在 `%LOCALAPPDATA%\com.huawenda.shiftschedule\EBWebView\`。

- 关程序、重装、升级都保留
- Rust 侧**不碰任何排班数据**，壳只负责开窗口和挂资源
- 导出/导入走的是浏览器原生机制，已实测在壳内可用

验证脚本（写入 → 杀进程 → 重启 → 读回）：

```bash
node scripts/verify-tauri-storage.mjs
```

## 已知问题

**NSIS 打包需要联网下载 NSIS 运行时**，直连 GitHub 会超时（与 git push 同一个原因）。
构建前设一下代理：

```powershell
$env:HTTP_PROXY='http://127.0.0.1:7897'
$env:HTTPS_PROXY='http://127.0.0.1:7897'
```

## 权限

`desktop/src-tauri/capabilities/default.json` 只开三样：`core:default`、
`dialog:allow-open` / `dialog:allow-save`，以及限定在 `$DOWNLOAD`/`$DOCUMENT`
的 `fs:allow-write-file` / `fs:allow-read-file`。

没有网络权限——应用本来也不发任何请求。

CSP 见 `tauri.conf.json` 的 `app.security.csp`，`default-src 'self'`。
