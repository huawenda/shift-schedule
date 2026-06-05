# Web Miniapp Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate the Web/PWA product line from the optional mini program line so each can use the most appropriate frontend and backend stack.

**Architecture:** Introduce a workspace layout with `apps/web` for pure Vite React Web development and `packages/core` for platform-neutral schedule logic. Keep the existing Taro app in place as the legacy miniapp/H5 branch during the first phase, then move or freeze it after the Web app reaches feature parity.

**Tech Stack:** Vite, React, TypeScript, Supabase, Cloudflare Pages, Taro legacy app, pnpm workspaces.

---

## File Structure

- `apps/web`: pure Web/PWA application. Owns Web UI, Web routing, Supabase services, PWA behavior, and Cloudflare Pages deployment.
- `packages/core`: pure TypeScript package for schedule data, shift calculations, salary math, statistics, and platform-neutral record maps.
- root Taro app: temporary legacy miniapp/H5 implementation. It remains runnable while Web is rebuilt.
- `PRODUCT.md`, `DESIGN.md`, `src/styles/design-tokens.scss`: design standards created before this architecture split. Web may later get its own CSS variable/token implementation.

## Phase 1: Establish Isolation

- [x] Add `pnpm-workspace.yaml`.
- [x] Create `packages/core` and copy platform-neutral schedule modules into it.
- [x] Create `apps/web` with Vite React and a first Web-only schedule screen.
- [x] Add root scripts for `dev:web`, `build:web`, `typecheck:web`, `test:core`, and `typecheck:core`.
- [x] Verify root Taro builds still work.
- [x] Verify core tests pass from the workspace package.
- [x] Verify Web builds from `apps/web`.

## Phase 2: Web Feature Migration

- [x] Move Web-only Supabase client logic from root `src/services` into `apps/web/src/services`.
- [x] Rebuild Web authentication using Supabase Auth only.
- [ ] Rebuild cloud sync as Web-only Supabase sync.
- [ ] Rebuild statistics and salary pages as Web-only React components.
- [ ] Rebuild PWA registration and Cloudflare Pages deployment docs for `apps/web`.

## Phase 3: Miniapp Containment

- [ ] Decide whether to keep Taro in root or move it to `apps/miniapp`.
- [ ] If moved, update Taro config paths, WeChat project config, scripts, and env loading.
- [ ] Remove H5-specific Taro scripts once pure Web replaces the Taro H5 build.
- [ ] Keep miniapp services pointed only at WeChat cloud development.

## Phase 4: Cleanup

- [ ] Remove duplicate Web logic from the legacy Taro app.
- [ ] Remove Supabase dependencies from miniapp package if no longer used there.
- [ ] Update docs to make Web the primary development path.
- [ ] Add CI-style commands for `typecheck:all`, `test:core`, and `build:web`.

## Verification Commands

Run these after Phase 1:

```bash
pnpm install
pnpm test:core
pnpm typecheck:core
pnpm typecheck:web
pnpm build:web
pnpm typecheck
pnpm build:weapp
```

Expected result: all commands pass. Existing bundle-size warnings from Taro builds are acceptable until the legacy app is moved or frozen.
