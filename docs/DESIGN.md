# Design system: "The Dossier"

**This has never been visually verified.** The Playwright browser-automation tool disconnected mid-session before a screenshot could be taken; everything here was confirmed structurally (build succeeds, the right classes/tokens/copy are present in the served HTML and CSS) but never actually looked at in a rendered browser. Treat this as a strong first draft that needs a human eye before being considered final — see `docs/STATUS.md`.

## The concept

The subject is a personal campus-placement season: PPTs, online/offline tests, interview rounds — real scheduled appointments a student must show up for, tracked solo through a high-stakes, anxious few months. The design leans into that directly rather than defaulting to a generic SaaS dashboard look: every event is treated like something you're *issued* — an admit card, a boarding document — something with a stamp, a stub, a specific place and time.

Two generic "AI-default" looks were deliberately avoided: (1) warm cream background + high-contrast serif + terracotta accent, and (2) near-black background + a single bright acid-color accent. This design uses a **navy** ground (not cream), parchment only as a *card surface* (not the page background), and **three** distinct semantic accents (brass, stamp-red, ledger-green) rather than one.

## Color

All colors are defined in `src/styles.css` as OKLCH (the repo's required format), mapped from the hex values below during design. Both hex and OKLCH are listed here since hex is what you'd reach for in a design tool and OKLCH is what's actually in the CSS.

| Name | Hex | OKLCH | Role |
|---|---|---|---|
| Ink | `#10162B` | `oklch(0.206 0.043 270.275)` | Page background |
| Sidebar ink | `#0B0F1F` | `oklch(0.174 0.034 271.851)` | Sidebar — slightly darker than the page, like a book's spine |
| Ink-lighter | `#1A2340` | `oklch(0.264 0.056 269.301)` | Secondary surfaces, muted/accent backgrounds |
| Ink-card | `#212B4A` | `oklch(0.296 0.058 269.121)` | Generic `Card` panel surface (not the signature EventCard — see below) |
| Parchment | `#EDE3C8` | `oklch(0.917 0.037 90.075)` | Foreground text color, and the EventCard's paper surface |
| Parchment-dim | `#E3D7B8` | `oklch(0.881 0.043 89.367)` | Slightly dimmer parchment variant (currently defined, lightly used) |
| Graphite | `#2A241C` | `oklch(0.264 0.017 74.882)` | Dark ink text — used on brass/parchment surfaces where light text wouldn't read |
| Brass | `#B8923A` | `oklch(0.679 0.114 85.195)` | Primary accent — buttons, active nav state, focus ring |
| Brass-bright | `#D4AF5A` | `oklch(0.770 0.112 86.066)` | Brighter brass for chart bars / high-contrast highlights |
| Stamp | `#9A2E2E` | `oklch(0.466 0.144 24.652)` | Destructive/urgent/rejected — an actual ink-stamp red, not a bright alert red |
| Ledger | `#2F6F5E` | `oklch(0.495 0.072 173.266)` | Success/offer accent — a deep bottle-green, not a bright emerald |
| Ledger-bright | `#3F9280` | `oklch(0.603 0.086 176.810)` | Brighter ledger variant for charts |
| Border-on-ink | `#3A4468` | `oklch(0.394 0.063 271.457)` | Hairline borders visible against the ink background |

There is no light/dark toggle anywhere in the app (confirmed by grepping for `classList`/`prefers-color-scheme`/theme-toggle logic — none exists), so this palette lives entirely in `:root`, and `.dark` simply mirrors the same values rather than defining a second theme. If a toggle is ever added, `.dark` in `src/styles.css` is where a genuinely different palette would go.

## Type

The IBM Plex superfamily — Sans, Serif, and Mono — loaded together via a single Google Fonts `@import` at the very top of `src/styles.css` (must precede `@import "tailwindcss"`; see `docs/DEVELOPMENT.md`'s CSS-ordering gotcha). This wasn't a random three-font pairing: IBM Plex was originally designed as IBM's own corporate/technical-documentation type system, which gives it a built-in "official document" personality that fits the admit-card concept directly, while still keeping each role visually distinct enough to read as a deliberate hierarchy rather than "the same font everywhere":

- **IBM Plex Serif** — display use only: company names, page headings, the dashboard's "Next Up" hero. Used with restraint, not for body copy.
- **IBM Plex Sans** — the default UI/body face (set on `body` via `font-family: var(--font-sans)` in `src/styles.css`).
- **IBM Plex Mono** — dates, times, nav labels, status/type badges, anything that reads as "data" rather than "prose." Small, tracked-out, uppercase.

## Signature element: the EventCard admit-card stub

`src/components/EventCard.tsx` is the one thing designed to be memorable. It's a parchment-colored card with a dashed vertical "perforation" line separating the main body (type badge, company name in serif, role, a dashed-rule meta section with mono date/time) from a narrow right-hand stub containing the event type code rotated 90° — mimicking a physical ticket or admit-card stub you'd tear along a perforated line. It recurs on the dashboard, the board, and (in spirit, via the table's own styling) the list view, so it's the one consistent visual anchor across the whole app.

High-priority events get a small rotated "Priority" badge outlined in stamp-red, evoking an actual ink stamp rather than a generic colored pill.

## Status/type color mapping

`src/lib/domain.ts`'s `STATUS_COLORS` and `TYPE_COLORS` were remapped from the original generic Tailwind rainbow (`bg-slate-500`, `bg-sky-500`, etc.) onto this palette's semantic roles — `REJECTED` uses the stamp-red (an actual rejection stamp), `OFFER` uses ledger-bright green, `GHOSTED` uses the faint border color (barely-there, "faded away"), and the interview-family statuses (`INTERVIEW_R1`/`R2`, `HR`) progress through the chart accent colors rather than reusing generic ambers/oranges.

## What was rejected

- Numbered step markers (01/02/03) for the sidebar nav — the five routes (Overview/Pipeline/Schedule/Docket/Settings) aren't actually a sequence with meaningful order, so numbering them would have been decoration pretending to be information.
- A big-number/gradient hero for the dashboard — replaced with the "Next Up" departures-board strip instead, since "what's my next scheduled thing" is the actual anxiety this app addresses, not a vanity metric.
- `lightningcss` as Vite's CSS transformer — the old Lovable-wrapped config used `css: { transformer: "lightningcss" }` for a performance boost; dropped when rebuilding `vite.config.ts` to avoid an extra dependency for a personal project where build-time CSS transform speed isn't a real constraint. Tailwind v4's own compiler handles all Tailwind-specific processing independently of this setting regardless, so nothing was lost functionally.
