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
