# Info tabs — design

Date: 2026-09-24
Status: approved, not built
Decisions D202–D208. Target: live before ECP Hub opens (28 Sep 2026).

## 1. Why

The Info page is one title and one rich-text body. Organisers want to split it the way
attendees look things up — "Travel", "Dress code", "FAQ" — rather than scroll one long page.
Unlike agenda days, these tabs follow no date: they are named and ordered by hand.

## 2. Decisions

- **D202** Tabs are rows in a new **`info_tabs`** table (`id`, `org_id`, `event_id`,
  `title` not null, `html`, `sort_order`, `created_at`), RLS on with no policies (service
  client only, like `agenda_days`). Chosen over a jsonb list on `events` because each tab is
  saved on its own: saving "FAQ" can never overwrite a concurrent edit to "Travel".

- **D203** `events.info_page_title` stays: it names the whole section — the Info tile's label
  and the page heading. Each tab has its own `title`. `events.info_page_html` is retired:
  migration 0040 copies it into one tab titled **"Details"**, and 0041 drops the column once
  the code that stopped reading it is live (code first, column last, as 0036/0037 and 0039).

- **D204** A fixed **Venue tab** is built from Settings — venue name and address with the
  Open map button, the event description, the contact line — exactly the block the Info page
  shows at its top today. It is always first, labelled "Venue", and only exists when Settings
  has at least one of those fields. It is not stored and not editable on the Info page.

- **D205** **The Info section exists when at least one custom tab has content** — the same
  rule as today's `!!info_page_html`. That one answer drives the Agenda | Info switch, the
  bar's Info slot, the agenda heading's visibility, and the desktop venue card's "More
  information" link. A custom tab whose content is empty is not shown to attendees. Venue
  details alone do not create an Info section (the desktop venue card already shows them).

- **D206** Portal: `/info?tab=<id>` (the Venue tab is `?tab=venue`). Tabs render in a strip
  shared with the agenda's day tabs — one `PortalTabStrip` component, scrolling sideways
  rather than wrapping. No valid `?tab` opens the first tab. With one tab in total there is
  no strip. The client chrome receives a boolean `hasInfo`, never the HTML (D121's rule: a
  client component's props are published).

- **D207** Admin Info page: the section title field (saved on its own), then the tab list —
  the Venue tab as a fixed first row marked "from Settings" with a link there, then the
  custom tabs in a `SortableList` (drag, arrow keys, move up/down; D197's idiom). Selecting
  a tab opens its editor on the page (`?tab=<id>`): title, the existing rich-text editor with
  image upload, Save tab. **Add tab** asks for a title and opens the new tab's editor.
  **Delete** confirms. Images inside a deleted tab's HTML stay in the bucket — the known
  limitation D160 already accepted for the info page.

- **D208** Rollout: 0040 is applied before the deploy; the old code keeps reading the old
  column meanwhile. Just before the push, any event whose `info_page_html` no longer matches
  its "Details" tab (an edit in the old admin during the window) is re-copied, so no edit is
  lost. Then the push, then 0041.

## 3. Migration 0040

```sql
create table info_tabs (…);                       -- D202
alter table info_tabs enable row level security;
create index on info_tabs (event_id, sort_order);
insert into info_tabs (org_id, event_id, title, html, sort_order)
select org_id, id, 'Details', info_page_html, 10 from events
where nullif(trim(info_page_html), '') is not null;
```

On 24 Sep this creates a "Details" tab for ecpwellness, ecpkom and the test event; ECP Hub
has no info content and gets none.

## 4. Testing

Unit (pure `src/lib/info-tabs.ts`): the Venue tab appears only with venue data; empty
custom tabs are hidden; order; `pickInfoTab` falls back to the first; `hasInfo`.
Live: 0040 applied and verified by query; the portal Info page of the test event renders the
same content under a "Details" tab after the deploy; admin add / rename / reorder / delete
on the test event. ECP Hub is never written to.

## 5. Not doing

- Per-tab categories or per-tab icons.
- Deleting uploaded images when a tab is deleted (D160's limitation stands).
- A Venue tab editable from the Info page — Settings stays its one source.
