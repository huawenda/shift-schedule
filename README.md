# Shift Schedule

倒班表是一个 Web-first 的倒班排班、加班统计和薪资计算工具。

## Project Structure

- `apps/web`: 主线 Web/PWA 应用，使用 Vite + React + Supabase，部署到 Cloudflare Pages。
- `apps/miniapp`: 可选微信小程序旁支，使用 Taro + 微信云开发。
- `packages/core`: 平台无关的排班数据、统计、薪资和规则计算。
- `docs`: 部署、数据库、迁移和开发说明。

## Primary Web Commands

```bash
pnpm dev:web
pnpm build:web
pnpm typecheck:web
pnpm verify:web
```

Cloudflare Pages 使用：

```text
Build command: pnpm install --frozen-lockfile && pnpm build:web
Build output directory: apps/web/dist
```

更多部署细节见 `docs/cloudflare-pages-supabase.md`。

## Miniapp Commands

```bash
pnpm dev:weapp
pnpm build:weapp
pnpm typecheck:miniapp
pnpm test:miniapp
pnpm verify:miniapp
```

微信开发者工具打开 `apps/miniapp`。更多说明见 `docs/miniapp-development.md`。

## Full Verification

```bash
pnpm verify:all
```

## 纯本地静态页（standalone）

`apps/local-standalone` 是一个**完全自包含**的纯本地版本：不联网、不需要登录和鉴权，
构建产物是一个可以整包拷到其他设备的静态文件夹。

它不依赖 `packages/core`，也不依赖 `apps/web`——逻辑和界面是拷贝过来的独立副本，
`@shift-schedule/core` 已替换为项目内的 `@local/core` 路径别名。

```bash
cd apps/local-standalone
pnpm build        # 产出 dist/，可直接双击 index.html 或挂静态服务器
pnpm test         # 62 个测试（含拷贝自 core 的 50 个，用于校验副本一致性）
pnpm verify:dist  # 无头浏览器真实跑一遍：改班次→落盘→刷新→统计页→导出备份
```

详见 `apps/local-standalone/README.md` 和产物内的 `使用说明.txt`。
