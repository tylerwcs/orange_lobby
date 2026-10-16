# Registration page banner, heading and background colours — design

Date: 16 Oct 2026. Decisions D618–D621. Migration 0090.
**Superseded the same day:** D619–D621 (heading colour, background colour, event bar on the ground)
were replaced by the event theme, D622–D632 (`2026-10-16-event-theme-design.md`); their values moved
into `events.theme` (0091) and the two columns were dropped (0092). D618, the banner, still stands.

**D618 — A banner above the registration page.** Settings → Registration gains an image field,
`Banner above the form`, saved with **Save settings** like the logo and the event banner. It shows
on `/e/<slug>/register` straight under the event bar (amended 16 Oct; it first sat above it), as
wide as the page column, at its own height: no crop, no fixed ratio. Shown whether registration is open or closed. Stored in
`events.registration_banner_url` (null = none); uploads as kind `registration-banner`. The portal's
own banner (`banner_url`) is unchanged.

**D619 — Heading colour.** Settings → Registration gains `Heading colour` (colour picker). It
colours the registration page's headings only: the event name in the header, `Register` (or
`Registration is closed`), and the form's section headings (`About you`, `Event terms`). Body text,
labels and buttons are unchanged. The default ink #111827 is stored as null. Like `--primary`
(D72), a colour too pale to read on white is darkened, keeping its hue, until it reaches 4.5:1.
Stored in `events.registration_heading_color` (#RRGGBB or null).

**D620 — Background colour.** Settings → Registration gains `Background colour` (colour
picker). It fills the page behind the form, across the whole window (the column stays phone
width). The header and the form card stay white. What sits straight on the ground - the
`Register` heading and the line under it - keeps the heading colour where that clears 4.5:1 on
the ground, and otherwise turns whichever of white or ink reads there. The default ground #F5F5F3
is stored as null. Stored in `events.registration_background_color` (#RRGGBB or null).

**D621 — The event bar sits on the background** (amended 16 Oct). When a background colour is
chosen, the event bar at the top takes it instead of white, and the event name shows in the
heading colour exactly as chosen (or white/ink when that would not read on the ground); the date
line follows the ground's text colour. With no background chosen the bar stays white. On the
white form card, a heading colour with no hue (white or a grey) that cannot be read shows as the
usual ink #111827 rather than being darkened to a dull grey; a coloured one is still darkened,
hue kept.

Server Action body limit goes from 10 MB to 14 MB: a Settings save can now carry three images
of up to 4 MB each.
