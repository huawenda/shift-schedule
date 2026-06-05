# Product

## Register

product

## Users

This is a shift scheduling tool for a small team working rotating shifts. The primary users are administrators who maintain the roster, review overtime, and check salary-related numbers, and ordinary staff who need to quickly understand their own shifts and the shared schedule.

Users open the app in short sessions, often on a phone, to answer practical questions: what shift am I on, who is working around me, what changed, and whether the latest cloud data has synced.

## Product Purpose

The product exists to make rotating-shift information easier to read, update, and trust across WeChat mini program and Web/H5 surfaces.

Success means the current month, current user, shift changes, team schedule, overtime, leave, and salary calculations are all discoverable without training. The interface should reduce second-guessing: users should know what data is local, what is synced, and what actions are available to their role.

## Brand Personality

Light, friendly, practical.

The interface should feel approachable for everyday staff use, but still precise enough for administrator workflows. It should be calm, clear, and helpful, with enough color to make shift states easy to scan. It should not feel like a heavy enterprise OA system.

## Anti-references

Avoid unstructured, one-off UI decisions where every new feature invents its own spacing, button shape, color, or state language.

Avoid generic dashboard templates, excessive cards, heavy shadows, ornamental gradients, decorative motion, and marketing-page composition. Avoid tiny low-contrast text, ambiguous sync states, and controls that look tappable in one place but static in another.

No specific external product is banned; the main anti-reference is inconsistency.

## Design Principles

1. Make the schedule scannable first. Shift colors, names, dates, and current-user context should be readable before secondary statistics or decoration.
2. Keep the product light and friendly. Use soft surfaces, clear labels, and reassuring states, but keep the density needed for real schedule work.
3. One component vocabulary. Buttons, cards, chips, inputs, tabs, and tables should reuse the same shape, spacing, and state rules across home and statistics pages.
4. Sync should be visible and calm. Users need explicit loading, saved, failed, and retry states without feeling punished by technical language.
5. Admin power should not leak into ordinary use. Ordinary users can see shared shift information, while private overtime, leave, and salary details should be gated in both UI and backend policy.

## Accessibility & Inclusion

Practical accessibility is the baseline. Prioritize readable text sizes on mobile, sufficient color contrast, generous tap targets, visible selected states, and clear loading/error feedback.

Do not rely on color alone for important meaning: shift labels must include text, current day should have a non-color indicator, and sync failures should use readable copy. Motion should be short and state-driven, with reduced-motion fallbacks when animations are added.
