# Miniapp Development

The WeChat mini program is isolated under `apps/miniapp`.

## Commands

From the repository root:

```bash
pnpm dev:weapp
pnpm build:weapp
pnpm typecheck:miniapp
pnpm test:miniapp
```

The root commands delegate to the `@shift-schedule/miniapp` workspace package.

## WeChat DevTools

Open this folder in WeChat DevTools:

```text
apps/miniapp
```

The mini program output is:

```text
apps/miniapp/dist
```

Cloud functions are under:

```text
apps/miniapp/cloudfunctions
```

## Backend Boundary

The miniapp line uses WeChat cloud development only:

- `getOpenid`
- `userProfile`
- `dayRecords`

Supabase and Cloudflare Pages belong to the Web line under `apps/web`.
