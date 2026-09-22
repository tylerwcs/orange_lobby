# Agenda and info-page images — design

Date: 2026-09-23
Status: built
Decision D160.

## 1. Why

Uploads already existed for the event's own identity — logo, banner, floor plan
(`0013_event_media.sql`) — but nothing an organiser writes could carry a picture. A session
could not show its speaker, and the info page could render an `<img>` (sanitizeHtml has
always allowed one) while offering no way to get an image to point it at. Organisers were
hosting pictures elsewhere and pasting links, or going without.

## 2. Decision

- **D160** Two nullable `text` columns hold the new URLs: **`agenda_items.image_url`** for a
  session, **`events.agenda_banner_url`** for the agenda's masthead. The info page gets no
  column — its images live inside `events.info_page_html` as `<img>` tags.

  *Plain URLs, like every image before them.* Nothing outside `mediaPathFromUrl` knows the
  bucket exists, so a link pasted before uploads existed and a link produced by one are the
  same kind of value, and only a delete needs to tell them apart.

  *The banner belongs to the event, not the day.* A three-day event shows one masthead
  rather than asking for a fresh image each morning.

  *A breakout round gets no picker.* Its form edits many rooms at once, so one field would
  set one picture for all of them. The image is a property of a session.

### The two shapes that needed care

**The agenda row is a schedule, not a gallery.** A day of full-width images is a scroll, and
the agenda's job is to let somebody see their day at a glance. So the image is a 44px
thumbnail on the row's *trailing* edge — the leading edge belongs to the hour and the colour
bar — and opens full size in a dialog when tapped (`AgendaImage`, the portal agenda's only
client component). Considered and rejected: full-width in the row, which reads better for
one session and worse for eight.

**The info uploader is a second submit on the same form as "Save page".** This is the whole
reason it is usable: the form posts the textarea's *current* value along with the file, so
`appendImage` appends to what the organiser is looking at. An uploader in its own form would
have to append to the *stored* HTML and would silently discard every unsaved edit. This is
what `SubmitButton` gained a `formAction` prop for.

`appendImage` lives in `src/lib/info-page.ts` and is tested against `sanitizeHtml` directly:
if the tag it writes were ever one the sanitiser drops, uploaded images would vanish from
the page that just accepted them.

## 3. Cleanup, and what is not cleaned up

Replacing or removing a session image or the banner deletes the old object, and deleting a
session deletes its image — `deleteAgendaItemAction` reads the row before the delete,
because afterwards there is nothing to ask. Order matters throughout and follows Settings:
nothing is removed from the bucket until the row naming its replacement is written.

**Known limitation.** An image inserted into the info page is *not* deleted when an
organiser removes its `<img>` tag from the HTML. The bucket has no idea the tag is gone. The
alternative — a table tracking every object referenced by that HTML, reconciled on save —
is a real feature, not a tidy-up, and buys an orphaned file's worth of storage. Accepted
deliberately; revisit if the bucket ever grows enough to notice.

The `updateBreakoutRoundAction` path passes `image_url: room.image_url` explicitly rather
than inheriting the create path's null, because `updateAgendaItem` is documented to send
every column and would otherwise clear an image that form never offered to change.

## 4. Testing

`tests/info-page.test.ts` — `appendImage` is the whole page when there was nothing, leaves
existing markup untouched, collapses trailing whitespace rather than piling up blank lines,
escapes quotes and markup in the description, and **writes a tag `sanitizeHtml` keeps**.
`tests/activities.test.ts` — a booked row carries no image, since it is built from an
`activity_sessions` row that has no such column.

Verified end to end against ECP Wellness 2026: an info-page upload appended its tag to
*unsaved* textarea content and rendered in the preview; a banner and a session image
uploaded, appeared on both the personal and public agenda, and opened full size on tap; the
booked InBody row showed no thumbnail; deleting the session removed its object from the
bucket; and the banner's Remove cleared both the column and the object. All test data was
removed afterwards.
