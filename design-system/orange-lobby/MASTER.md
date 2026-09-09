# Orange Lobby — Design System (verified)

Generated with the ui-ux-pro-max skill on 2026-09-09 and then reconciled with the decisions already
in `docs/superpowers/specs/2026-09-07-orange-lobby-pilot.md` §8 (D26–D33). Where the generator and the
spec disagreed, the spec won; what follows is what the app actually uses.

## Product shape
Operate-mode tool with three surfaces: an attendee portal opened from a badge QR (mobile, no login),
a crew scanner (phone, one thumb, 100 people in 30 minutes), and an organiser admin (desktop).

## Style
**Accessible & Ethical** (from the generator's second run) applied on top of the tile-grid lobby
structure: high contrast, 16px+ body text, keyboard navigation, visible focus rings, reduced motion,
44px touch targets. Rejected: the first run's "Vibrant & Block-based" purple landing-page style, which
targets consumer event marketing, not onsite operations.

## Colour (tokens in `src/app/globals.css`)
| Token | Value | Role |
|---|---|---|
| `--canvas` | #F4F5F7 | page background |
| `--surface` | #FFFFFF | cards, bars |
| `--ink` | #111827 | text, dark panels |
| `--muted` | #4B5563 | secondary text (≥ 4.5:1 on surface) |
| `--line` | #E5E7EB | borders |
| `--brand` | event `primary_color`, default #F97316 | accents only, never body text |
| `--brand-ink` | color-mix(brand 72%, black) | accent text, active nav |
| `--brand-soft` | color-mix(brand 14%, white) | accent tints |
| `--danger` | #DC2626 | destructive actions |

Per-event brand colour is applied by `brandStyle()` on the portal shell; admin and scanner keep the default.

## Typography
Manrope (next/font, weights 400–800), one scale: 11px caps labels, 12–13px meta, 14–16px body,
17–20px card titles, 22–24px page titles, 3xl stats. Numbers in tables, counters and times use
tabular numerals. Rejected: Inter/Playfair (run 1) and Plus Jakarta Sans (run 2) to avoid churn.

## Spacing and shape
4px base; 16px card radius, 10px control radius, pill 999px. Cards separate groups; proximity groups
items inside them. Sticky side forms on desktop admin pages at 400px.

## Interaction rules adopted from the skill's UX dataset
- Focus: 3px brand outline, 2px offset, `scroll-margin-block` so sticky bars never hide the focused control.
- Touch: 44px minimum targets, 8px gaps, `touch-action: manipulation`, pointer cursors, press feedback.
- Motion: 150ms colour transitions; everything collapses under `prefers-reduced-motion`.
- Loading: `loading.tsx` skeletons for the portal, admin event pages and scanner; submit buttons show a spinner and `aria-busy`.
- Forms: visible labels bound to inputs, helper text, errors next to the field, autocomplete hints; conditional questions via `show_when`.
- Status: scan results announced in one polite live region with a complete phrase.
- Images: reserved dimensions on QR codes and banners; floor plans lazy-load.
- Skip link on the portal and admin.

## Pre-delivery checklist
- [x] No emoji as icons (inline SVG set in `src/components/ui/Icon.tsx`)
- [x] Pointer cursor on clickable elements
- [x] Hover and press states with transitions
- [x] Text contrast ≥ 4.5:1 in light mode
- [x] Visible focus for keyboard users
- [x] `prefers-reduced-motion` respected
- [x] Responsive at 375, 768, 1024, 1440, 1920
