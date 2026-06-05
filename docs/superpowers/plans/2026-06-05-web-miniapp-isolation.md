# Web Miniapp Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate the Web/PWA product line from the optional mini program line so each can use the most appropriate frontend and backend stack.

**Architecture:** Use a workspace layout with `apps/web` for pure Vite React Web development, `apps/miniapp` for the optional WeChat mini program, and `packages/core` for platform-neutral schedule logic. Web and miniapp are intentionally separate product lines.

**Tech Stack:** Vite, React, TypeScript, Supabase, Cloudflare Pages, Taro miniapp, WeChat cloud development, pnpm workspaces.

---

## File Structure

- `apps/web`: pure Web/PWA application. Owns Web UI, Web routing, Supabase services, PWA behavior, and Cloudflare Pages deployment.
- `packages/core`: pure TypeScript package for schedule data, shift calculations, salary math, statistics, and platform-neutral record maps.
- `apps/miniapp`: optional Taro WeChat mini program. It owns its own config, WeChat project file, cloud functions, and tests.
- `PRODUCT.md`, `DESIGN.md`, `apps/miniapp/src/styles/design-tokens.scss`: design standards created before this architecture split. Web has its own CSS variable implementation.

## Phase 1: Establish Isolation

- [x] Add `pnpm-workspace.yaml`.
- [x] Create `packages/core` and copy platform-neutral schedule modules into it.
- [x] Create `apps/web` with Vite React and a first Web-only schedule screen.
- [x] Add root scripts for Web, miniapp, and core workspace packages.
- [x] Verify Taro miniapp builds still work.
- [x] Verify core tests pass from the workspace package.
- [x] Verify Web builds from `apps/web`.

## Phase 2: Web Feature Migration

- [x] Move Web-only Supabase client logic from root `src/services` into `apps/web/src/services`.
- [x] Rebuild Web authentication using Supabase Auth only.
- [x] Rebuild cloud sync as Web-only Supabase sync.
- [x] Rebuild statistics and salary pages as Web-only React components.
- [x] Rebuild PWA registration and Cloudflare Pages deployment docs for `apps/web`.

## Phase 3: Miniapp Containment

- [x] Decide whether to keep Taro in root or move it to `apps/miniapp`.
- [x] If moved, update Taro config paths, WeChat project config, scripts, and env loading.
- [x] Remove H5-specific Taro scripts once pure Web replaces the Taro H5 build.
- [x] Keep miniapp services pointed only at WeChat cloud development.

## Phase 4: Cleanup

- [x] Remove duplicate Web logic from the Taro miniapp app.
- [x] Remove Supabase dependencies from miniapp package if no longer used there.
- [x] Update docs to make Web the primary development path.
- [x] Add CI-style commands for `typecheck:all`, `test:core`, and `build:web`.

## Verification Commands

Run these after the migration:

```bash
pnpm install
pnpm verify:all
```

Expected result: all commands pass. Existing bundle-size warnings from Taro miniapp builds are acceptable while the optional miniapp line remains Taro-based.
