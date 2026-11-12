# AGENTS.md

本分支只有一条产物线：根目录 Web 静态版 + Tauri 桌面壳（共用一套 `src/` 前端）。
uni-app 小程序线已迁到 `refactor` 分支单独开发，本分支不包含 `miniapp-uni/`。

## 先读哪份

| 改动范围 | 必读文档 |
|---|---|
| 根目录 web / 桌面（`src/`、`desktop/`） | [DESIGN.md](DESIGN.md)、[README.md](README.md) |

## 硬规则

1. **每次开发前必须先读上表两份文档**，再动代码。
2. **样式只从 token 取**：颜色、字号、间距、圆角、阴影一律用 `var(--…)`；页面与组件里不准硬写 hex / rgba。
3. **不混第二套 UI 库**：统一用 `components/ui/`（shadcn CLI 复制源码）与项目自建组件，不额外引入另一套组件库。
4. **复用阈值 ≥ 2**：同一展示形式出现两次就抽组件或公共 class，禁止在页面里复制一套。
5. **目录归位**：页面进 `screens/`，功能域进 `features/`，可复用组件进 `components/`，纯数据与规则进 `data/`，平台能力进 `platform/`，状态逻辑进 `hooks/`，样式 token 进 `styles/`。
6. **改完先自查再上报**：
   - 有没有绕开 token / 公共组件？
   - 有没有把业务逻辑塞进页面模板？
   - 跑 `pnpm build`、`pnpm test`。
7. **非必要不截图、不跑全量 verify**：实机验收由用户做；小改动先自查，确实需要截图或自动化证据时再说明原因。
8. **只做宽屏**：不做窄屏 / 手机响应式；侧栏展开 224px / 折叠 44px、不随窗口收缩，底部不出现移动端 tab。
   `node scripts/verify-dist.mjs --only=wide` 会做 DOM 与源码层断言，别绕过。
