---
name: "Shift Schedule"
description: "A light, friendly product UI for rotating-shift schedules, sync, statistics, and salary review."
colors:
  canvas: "#eef4fb"
  canvas-soft: "#f7f9fc"
  surface: "#ffffff"
  surface-muted: "#f6f9fd"
  border-soft: "#eef2f7"
  border-strong: "#cdd7e5"
  ink: "#172033"
  ink-soft: "#526071"
  muted: "#667085"
  primary: "#2563eb"
  primary-soft: "#eff6ff"
  primary-border: "#bfdbfe"
  day-bg: "#dff3ff"
  day-text: "#02689f"
  night-bg: "#eee9ff"
  night-text: "#5b21b6"
  rest-bg: "#dcfce7"
  rest-text: "#047857"
  special-day-bg: "#fff0c2"
  special-day-text: "#b45309"
  special-night-bg: "#fde7c7"
  special-night-text: "#9a3412"
  leave-bg: "#e5e7eb"
  leave-text: "#475467"
  legal-bg: "#fee2e2"
  legal-text: "#dc2626"
  success: "#15803d"
  warning: "#f59e0b"
  danger: "#ef4444"
typography:
  headline:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0"
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "0"
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0"
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "18px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0"
rounded:
  sm: "8px"
  md: "10px"
  lg: "14px"
  xl: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "0 18px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "0 18px"
  button-sync:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "0 18px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "18px"
  input:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 12px"
---

# Design System: Shift Schedule

## 1. Overview

**Creative North Star: "Friendly Control Room"**

This design system is for a practical scheduling product that people open often and read quickly. It should feel light, friendly, and reliable: clear enough for administrators editing shifts, soft enough for everyday staff checking their month, and dense enough to keep schedule data in view.

The system is mobile-first and product-first. Visual polish should support scanning, trust, and fast action. Avoid decorative hero language, oversized marketing composition, and one-off visual experiments inside workflow screens.

**Key Characteristics:**
- Soft cold canvas, white work surfaces, and blue as the only primary action color.
- Rich semantic shift chips that always include text, never color alone.
- Compact but readable typography using a single system sans stack.
- Rounded controls with consistent shape rules: cards are soft rectangles, actions are pills, chips are pills.
- Shadows are restrained; structure comes from layout, borders, and tonal layers.

## 2. Colors

The palette is a cool, airy product palette with one command color and a separate semantic shift vocabulary.

### Primary
- **Action Blue** (#2563eb): primary actions, selected tabs, active indicators, current-day emphasis, and sync affordances.
- **Action Blue Soft** (#eff6ff): secondary action backgrounds and light active surfaces.
- **Action Blue Border** (#bfdbfe): borders around sync and secondary blue controls.

### Secondary
- **Shift Day Cyan** (#dff3ff / #02689f): day shift chips and cells.
- **Shift Night Violet** (#eee9ff / #5b21b6): night shift chips and cells.
- **Shift Rest Green** (#dcfce7 / #047857): rest-day chips and cells.
- **Special Day Amber** (#fff0c2 / #b45309): day special shift chips and salary/overtime markers.
- **Special Night Apricot** (#fde7c7 / #9a3412): night special shift chips.
- **Legal Red** (#fee2e2 / #dc2626): legal holiday overtime and destructive/critical salary states.

### Neutral
- **App Canvas** (#eef4fb): PWA status bar, page base, and mobile shell background.
- **Content Canvas** (#f7f9fc): lower-page content background where long lists and tables live.
- **Surface** (#ffffff): cards, tables, modals, buttons, and inputs.
- **Surface Muted** (#f6f9fd): filter fields, disabled fields, and low-emphasis panels.
- **Ink** (#172033): titles, user names, numbers, and primary data.
- **Ink Soft** (#526071): secondary labels that still need strong readability.
- **Muted** (#667085): dates, helper text, and secondary metadata.
- **Soft Border** (#eef2f7): card and table dividers.
- **Strong Border** (#cdd7e5): button strokes and control boundaries.

### Named Rules

**The One Command Color Rule.** Blue is the command color. Do not introduce another primary action accent unless the product gains a true brand system.

**The Shift Color Rule.** Shift colors are semantic data colors, not decoration. They appear only where a shift type, overtime type, or leave state is being represented.

**The Canvas Continuity Rule.** Mobile page backgrounds, PWA theme color, and scroll containers must visually connect. If a band appears between sections, fix the surface layering before adding more decoration.

## 3. Typography

**Display Font:** system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif  
**Body Font:** system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif  
**Label/Mono Font:** same stack; no separate mono style is currently needed.

**Character:** The typography is practical, confident, and compact. Use weight and spacing for hierarchy, not decorative font changes.

### Hierarchy
- **Headline** (800, 32px, 1.2): page titles such as "倒班表" and "统计".
- **Title** (800, 26px, 1.25): card titles, table titles, modal titles, and important section labels.
- **Body** (700, 20px, 1.35): readable schedule metadata, helper text, names, and values inside product surfaces.
- **Label** (800, 18px, 1.1): chips, compact buttons, table headers, shift labels, and status badges.
- **Micro Label** (700-800, 13-16px): lunar dates, badge suffixes, and dense calendar metadata. Use sparingly and keep contrast high.

### Named Rules

**The No Fluid Type Rule.** Product UI type should use fixed sizes and breakpoint-specific adjustments, not viewport-scaled headings.

**The Number Priority Rule.** Counts, hours, salary totals, and current dates are data. They should be heavier than nearby helper labels and must not be hidden behind muted gray.

## 4. Elevation

The system uses a hybrid of tonal layering and very restrained shadows. Cards are mostly separated by white surfaces and soft borders. Shadows should be used to clarify sticky/floating layers, not to decorate every card.

### Shadow Vocabulary
- **Mobile Shell** (`0 22px 58px rgba(15, 23, 42, 0.16)`): only for framed mobile previews when a phone-sized app surface is rendered inside a wide desktop browser.
- **Raised Control** (`0 4px 12px rgba(25, 39, 70, 0.08)`): selected segmented controls and small floating controls.
- **Sticky Column** (`8px 0 16px rgba(25, 39, 70, 0.08)`): frozen table columns when horizontal scrolling needs edge separation.
- **Resting Card** (`none` or `0 1px 2px rgba(15, 23, 42, 0.04)`): default card depth on mobile.

### Named Rules

**The Flat-By-Default Rule.** If a border and tonal background already separate an element, do not add a wide shadow.

**The No Ghost Card Rule.** Avoid pairing a 1px soft border with a large blurry shadow on the same resting card.

## 5. Components

### Buttons

- **Shape:** full pill (`999px`) for primary, secondary, sync, and navigation actions.
- **Size:** default height is `48px`; compact actions may be smaller only inside dense tables.
- **Primary:** Action Blue background with white text.
- **Secondary:** white or Action Blue Soft background with Action Blue text and a soft border.
- **Loading:** keep the same footprint; change label and/or show a spinner without shifting nearby controls.
- **Disabled:** Surface Muted background, Strong Border, Muted text.

### Chips

- **Style:** full pill, bold label, semantic background/text pair.
- **Shift chips:** always include the Chinese shift label. Color alone is not enough.
- **Admin/status badges:** use compact pills, but keep them subordinate to the person name.
- **Selected chips:** may use a stronger border or Action Blue outline; do not remove the text color meaning.

### Cards / Containers

- **Corner Style:** `14px` for main product cards, `18px` only for app marks or modal-like sheets.
- **Background:** Surface for cards; Surface Muted for fields and low-emphasis panels.
- **Border:** Soft Border by default.
- **Internal Padding:** `18px` on mobile cards; denser table cells can use `8px-12px`.
- **Rule:** cards should not be nested just to create separation. Use section spacing or dividers first.

### Inputs / Fields

- **Style:** Surface Muted fill, Strong or Soft Border, `10px-12px` radius.
- **Focus:** Action Blue border with a subtle blue background shift. Keep focus visible on Web and miniapp form controls.
- **Error:** Danger text and a light red background only for the affected field or row.
- **Disabled:** lower contrast surface, but labels must remain readable.

### Navigation

- **Month tabs:** horizontal, scrollable, stable-width controls. Active month uses a white or blue-selected state with clear weight.
- **View tabs:** segmented controls with two or more fixed options; active option uses Action Blue.
- **Back/sync/switch:** actions live near the current context, not in unrelated page chrome.

### Tables / Schedule Grids

- **Frozen identity column:** use a subtle edge shadow only while horizontal scrolling exists.
- **Cell density:** keep date, weekday, and shift visible without requiring tap.
- **Today/current selection:** combine color with a dot, border, or weight change.
- **Horizontal scroll hint:** should be explicit but quiet; do not cover table content.

### Status & Feedback

- **Sync:** expose idle, loading, saved, failed, and retry states. The same wording should be used on home and statistics pages.
- **Loading:** prefer skeleton or inline status where content belongs. Large centered spinners are acceptable only for initial page load.
- **Empty:** explain what the user can do next, not just that nothing exists.
- **Error:** use human-readable Chinese copy with the failing action and the next option.

## 6. Do's and Don'ts

### Do

- Use the design tokens in this file before adding a new color, radius, font size, or shadow.
- Keep the mobile experience first: all controls need comfortable tap targets and clear selected states.
- Use white surfaces and soft borders for structure, then reserve blue for actual commands or selection.
- Keep shift colors stable across home, multi-view schedule, statistics, and salary screens.
- Make sync and save states visible without noisy alerts.

### Don't

- Do not introduce a new accent color for a one-off button.
- Do not use decorative gradients, glass effects, or large shadows to make a workflow screen feel polished.
- Do not create a new card style when an existing card/container pattern can express the hierarchy.
- Do not make text smaller to fit more data if horizontal scrolling or denser layout would preserve readability.
- Do not rely on the frontend alone for permission-sensitive information such as overtime, leave, or salary data.
