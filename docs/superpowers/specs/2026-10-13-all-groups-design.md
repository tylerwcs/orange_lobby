# Groups page with All groups — design

Approved in chat on 13 Oct 2026, from the user's phone sketch of "Meet the team". The sketch
shows a list of team cards, each with a banner picture and the team name. The attendee's own
team carries a "My Group" badge, and tapping a card opens a numbered list of its members.

- **Today:** the portal has a **My group** page that shows only the attendee's own group.
- **Change:** that page becomes **Groups**, with two tabs. **My group** is today's page,
  unchanged. **All groups** is the new card list.

Decision numbers D506–D515 belong to this spec.

## Context checked on 13 Oct 2026

- **Groups** (D344–D361, migration 0055):
  - Groups live in `event_groups (id, org_id, event_id, name, created_at)`.
  - An attendee is in at most one group (`attendees.group_id`).
  - The admin pages are `/admin/events/[id]/groups` (the list) and `.../groups/[groupId]`
    (one group's members).
- **My group page** is `src/app/e/[slug]/a/[token]/group/page.tsx` (D348). It shows:
  - the group's name and member count;
  - the members, with tagged ones first (D366);
  - the shared fields `events.group_fields`, where a "Yes" value renders as a badge (Captain,
    Vice Captain);
  - the group submission forms.

  It returns `notFound()` when the attendee has no group or `events.group_tile` is off (D367).
- **The launcher tile** comes from `launcherItems` in `src/lib/launcher.ts`:
  - The portal home passes `hasGroup: event.group_tile && !!attendee.group_id`.
  - The tile is labelled "My group", links to `/group`, and its picture is
    `section_icons.group` (D362).
- **Portal tabs already exist** on Info. The tab is chosen by `?tab=` in the URL
  (`pickInfoTab`), on a server-rendered page.
- **Event images** are stored as public URLs in `MEDIA_BUCKET`:
  - `uploadEventImage` / `nextImage` / `deleteEventImage` in `src/lib/db/media.ts`
  - paths `<org>/<event>/<kind>-<id>.<ext>`
  - kinds listed in `ImageKind` in `src/lib/storage.ts`
  - checked by `acceptImage`
- **Loading every attendee** has to page past PostgREST's 1,000-row cap. `listAttendees`
  already pages with `selectAll`.
- **Real data:** ecphub is the live event, with Group 01–12 and 122 members. Test only on
  ecpkom.

## Decisions

- **D506 Picture per group, optional.**
  - New column `event_groups.image_url text null`, holding a public `MEDIA_BUCKET` URL like the
    other event images.
  - New `ImageKind` `"group"`.
  - Checked by `acceptImage`, the same as every other event image.
- **D507 The All groups switch.**
  - New column `events.all_groups boolean not null default false`.
  - Off by default, so ecphub and ecpkom look the same until an admin turns it on.
  - It is separate from `group_tile`: `group_tile` still turns the whole tile and page off.
- **D508 The tile is now Groups.**
  - The launcher label changes from "My group" to "Groups". The link stays `/group`, so old
    links and bookmarks keep working.
  - The tile shows when `group_tile` is on **and** either the attendee is in a group or
    `all_groups` is on.
  - `launcherItems` keeps its `hasGroup` flag; only what the portal home passes in changes.
- **D509 Which tabs show.**
  - **My group** shows when the attendee is in a group.
  - **All groups** shows when `all_groups` is on.
  - If neither applies, the page is `notFound()`.
  - With only one tab there is no tab bar.
  - The default tab is My group when present. An unknown `?tab=` falls back to the default.
  - One pure function, `groupTabs({ inGroup, allGroups })`, decides the tabs, and the tab
    picker reuses it.
- **D510 My group is unchanged** apart from sitting under the tab bar. Its heading still says
  "My group" and the group's name.
- **D511 The All groups card.**
  - **Closed state:** a bordered card.
    - The picture sits on the left, cropped to 3:2 with `object-cover`, about 45% of the card's
      width.
    - The group's name sits on the right in bold, with a "My group" badge on the attendee's
      own group.
    - A chevron at the end points right when closed and down when open.
  - **Card with no picture:** name and member count only, with no empty picture box.
  - **Expanding:** native `<details>`/`<summary>`, so it is server-rendered with no client
    JavaScript and is keyboard-accessible.
  - All cards start closed.
- **D512 What another group's card reveals.**
  - When opened, a card lists its members as numbered rows, with names truncated on one line.
  - The order is `taggedFirst`, then by name.
  - Tag badges (Captain / Vice Captain: a shared field whose value is "Yes") show.
  - Other shared fields, such as a table number, **do not**. They stay on the attendee's own
    My group tab.
  - The attendee's own group's card follows the same rule, so every card looks alike.
- **D513 Card order.** The attendee's own group comes first, then the rest by name, as
  `listGroups` already orders them. Twelve teams is too long a scroll to hunt for your own.
- **D514 An attendee with no group** sees the tile and the All groups tab only when
  `all_groups` is on. No group and the switch off means no tile at all, as today.
- **D515 Admin.**
  - **Each group's page** (`groups/[groupId]`) gets a **Picture** card: upload, replace or
    remove the image, with the hint "Landscape, about 3:2 (e.g. 900×600)". It uses
    `nextImage`, and the old object is deleted only after the row has saved.
  - **Groups page settings popup:** the title "My group tile" becomes "Groups tile". The
    existing on/off form gains a second checkbox, "Show all groups to attendees", saved by the
    same action. The tile icon form stays as it is.
  - **Deleting a group** also calls `deleteEventImage` on its picture, after the row is gone.

## Data loading

- **New function in `src/lib/db/groups.ts`: `groupedAttendees(eventId)`.**
  - Returns every attendee in the event with a group.
  - Selects only `id, name, group_id, extra`.
  - Pages with `selectAll` (`src/lib/db/select-all.ts`), so events over 1,000 attendees are
    complete.
- **The Groups page loads only what its tabs need:**
  - My group: `getGroup` + `groupMembers` + activity entries, as today.
  - All groups: `listGroups` + `groupedAttendees`.

  When only one tab shows, the other tab's queries do not run. When both show, everything
  needed loads in one `Promise.all`. The open tab renders, and the other tab is just its link.
- **Pure helpers in `src/lib/groups.ts`**, so they can be unit-tested:
  - `groupTabs`: D509.
  - `allGroupCards(groups, members, ownGroupId, groupFields, fields)`: returns the ordered
    cards (D513), each with its members in `taggedFirst` order and each member's tag labels
    only (D512).

## Migration 0078

```sql
alter table event_groups add column image_url text;
alter table events add column all_groups boolean not null default false;
```

- No RLS change is needed: both tables are read with the service client on the server, as
  today.
- Update `EventGroup` and `Event` in `src/lib/types.ts`.

## Out of scope

- Captain/co-captain photos built from member data. The picture is one image an organiser
  uploads, as in the sketch.
- Group submissions on the All groups tab.
- Showing All groups on the public (no-token) event page.

## Testing

- **Unit tests** (Vitest, in the existing `tests/groups.test.ts`):
  - `groupTabs` for all four combinations of in-group / switch.
  - `allGroupCards`:
    - own group first;
    - members in tagged-first order;
    - non-tag shared fields dropped;
    - an empty group still listed with 0 members;
    - a group without a picture flagged as such.
- **Browser check on ecpkom only**, at phone width (375px):
  - switch off: the tile reads Groups, there is no tab bar, and the page is today's;
  - switch on: both tabs, cards open and close, the badge is on the right card, and there are
    no table numbers on other groups;
  - an attendee with no group: All groups only, and no tile when the switch is off;
  - admin: upload, replace and remove a picture; the switch saves; deleting a test group with
    a picture leaves no error.
- **Never touch ecphub** (the live event).
