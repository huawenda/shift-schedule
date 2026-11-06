# AGENTS.md

本项目有两条产物线，动手前先读对应规范，不要混用两套规则。

## 先读哪份

| 改动范围 | 必读文档 |
|---|---|
| 根目录 web / 桌面（`src/`、`desktop/`） | [DESIGN.md](DESIGN.md)、[README.md](README.md) |
| 小程序（`miniapp-uni/`） | [miniapp-uni/DESIGN.md](miniapp-uni/DESIGN.md)、[miniapp-uni/DEVELOPMENT.md](miniapp-uni/DEVELOPMENT.md) |

## 硬规则

1. **每次开发前必须先读上表对应的两份文档**，再动代码。
2. **样式只从 token 取**：颜色、字号、间距、圆角、阴影一律用 `var(--…)`；页面与组件里不准硬写 hex / rgba。
   唯一例外是 `uni.showModal` 这类只接收字面色值的 API，集中成一个常量并注释原因。
3. **不混第二套 UI 库**：小程序端用项目自建的 `styles/base.scss` + `components/`，不额外引入 uni-ui / uView 等组件库。
4. **复用阈值 ≥ 2**：同一展示形式出现两次就抽组件或公共 class，禁止在页面里复制一套。
5. **目录归位**：页面进 `pages/`，可复用组件进 `components/`，纯数据与规则进 `data/`，状态入口进 `store/`，工具进 `utils/`，样式 token 进 `styles/`。
6. **改完先自查再上报**：
   - 有没有绕开 token / 公共组件？
   - 有没有把业务逻辑塞进页面模板？
   - web 端跑 `pnpm build`、`pnpm test`；小程序跑 `pnpm -C miniapp-uni type-check`、`build:mp-weixin`、`pnpm verify:miniapp-uni`。
7. **非必要不截图、不跑全量 verify**：小程序验收由用户实机验证；小改动先自查，确实需要截图或自动化证据时再说明原因。
8. **小程序固定编译流程**：模拟器不支持热重载，顺序必须是「构建 → 全部清除 → 编译」：
   1. `pnpm -C miniapp-uni build:mp-weixin`
   2. 微信开发者工具「全部清除」（MCP `debug_clear_cache` 执行 `cleanAll`）
   3. 刷新或重开项目窗口完成编译验收

   顺序不可颠倒，否则改动不生效；新增组件还会被判为 `Component is not found`，只渲染插槽内容、外壳样式全部丢失。
