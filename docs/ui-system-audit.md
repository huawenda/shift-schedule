# UI System Audit

This audit records the first pass of standardizing the home and statistics pages against `PRODUCT.md` and `DESIGN.md`.

## Scope

- Home page: `apps/miniapp/src/pages/index/index.scss`
- Statistics page: `apps/miniapp/src/pages/stats/index.scss`
- Global app shell: `apps/miniapp/src/app.scss`
- Shared design tokens: `apps/miniapp/src/styles/design-tokens.scss`

## Findings

### 1. Product Register

The project is a product UI, not a brand or marketing surface. The interface should optimize for schedule scanning, role clarity, sync trust, and mobile readability.

Design direction: light, friendly, practical.

### 2. Drift Before This Pass

- Page shell backgrounds were repeated in page files.
- Buttons on the home and statistics pages were visually similar but separately implemented.
- Card surfaces, radii, borders, and shadows were repeated across pages.
- Shift colors were duplicated in multiple selector families, with small mismatches between pages.
- Loading spinners and disabled/loading states used hard-coded colors.
- Inputs and field surfaces shared a visual language but were not tokenized yet.

### 3. Standardization Applied

- Added `apps/miniapp/src/styles/design-tokens.scss` as the shared SCSS token and mixin layer.
- Connected global background and H5 app shell to shared canvas and shadow tokens.
- Connected home and statistics page shells to a shared `page-shell` mixin.
- Connected primary/secondary/sync pill buttons to a shared `pill-control` mixin where safe.
- Connected cards to a shared `card-surface` mixin for major page surfaces.
- Connected loading spinners to a shared `spinner` mixin.
- Connected home and statistics shift chips to shared semantic shift tokens.
- Preserved current layout behavior and avoided large visual rewrites in this pass.

## Tokenization Strategy

Keep the SCSS token layer small and practical:

- Use SCSS variables and mixins because they compile cleanly for both H5 and WeChat mini program outputs.
- Do not introduce a new component library for this Taro app.
- Use shared mixins for stable product primitives: page shell, cards, pill controls, fields, spinners, semantic chips.
- Keep highly contextual table layout rules inside page SCSS until the repeated patterns are clearer.

## Next Refactor Targets

1. Extract field/input styles for salary inputs, overtime inputs, and profile binding inputs.
2. Extract segmented controls for month tabs, view tabs, auth tabs, and table view toggles.
3. Normalize status text styles for sync, salary save, loading, error, and empty states.
4. Reduce remaining hard-coded neutrals in table rows, dividers, and secondary labels.
5. Review mobile spacing after tokenization with H5 and WeChat devtools screenshots.

## Rules For Future UI Changes

- Check `DESIGN.md` before adding a new color, radius, shadow, or font size.
- Prefer `apps/miniapp/src/styles/design-tokens.scss` for product primitives.
- If a selector duplicates a button, card, chip, field, or spinner pattern, add or reuse a mixin instead of hard-coding.
- Preserve the semantic shift color mapping across home, statistics, salary, and future pages.
- Keep visual changes incremental and verified on both H5 and mini program builds.
