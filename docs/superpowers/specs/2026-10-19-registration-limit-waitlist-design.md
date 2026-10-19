# Registration limit, waiting list and approval — design

Date: 19 Oct 2026. Decisions D677–D703. Migration 0100.
**Amended the same day with an approval step (D696–D703)**: see the section at the end; where it
differs from the earlier sections, the amendment wins.

## Intent

Some events have a fixed number of places. The organiser wants to cap self-registration and,
once it is full, keep a fair queue of people who would still like to come: when someone drops
out, the next person in the queue gets the place automatically and is told on WhatsApp, without
the organiser having to manage it by hand.

## Goals (what the organiser asked for)

- **D677 — A limit on form registrations.** Settings → Registration gains
  `Limit registrations to [number]` (blank = no limit). Only people who registered through the
  public form count towards it (`source = 'registration'`, not cancelled). People imported from
  the masterlist or added by an admin never use up places and are never blocked by the limit.
- **D678 — "Registration is full", then the waiting list.** When the limit is reached and
  registration is otherwise open, the registration link shows **Registration is full** with a
  **Join the waiting list** button. The button opens the same registration form (same questions,
  terms and Privacy Notice ticks, same checks), headed so it is clear they are joining the waiting
  list. Submitting puts them on the waiting list, not on the registered list.
- **D679 — First come, first served.** The waiting list is ordered by when each person joined.
  Re-submitting with an email already on the waiting list updates their answers and keeps their
  place.
- **D680 — Their link while waiting.** After joining, the person lands on their own link (the
  same `/a/<token>` link they will keep once moved in), which shows **You're on the waiting list**
  with their current position ("number 3") and the event name/date. They cannot use the portal
  (agenda, activities, Me) until they are moved in.
- **D681 — Leaving the waiting list.** That page has **Leave the waiting list** (with a confirm
  step). It takes effect at once, no organiser approval. Their link then says they have left,
  with a way to register again if registration is open.
- **D682 — Moved in automatically when a place frees.** While registration is open (not closed by
  the switch, not past its close time, event not archived), whenever a counted place frees up,
  the first person on the waiting list is moved in: they become a normal registered attendee
  (counted, listed, can use the portal on the same link). A place frees when:
  - an organiser **approves a cancellation request** of someone who registered through the form;
  - an organiser **deletes** someone who registered through the form (single or bulk);
  - the organiser **raises the limit** or **clears it** (as many people as now fit are moved in).
  More than one place freeing at once moves in as many people as there are places.
- **D683 — No automatic moves after registration closes.** Once registration closes (switch off,
  close time passed, or archived) nobody is moved in automatically. The organiser can still move
  people in by hand (D685).
- **D684 — WhatsApp when moved in.** A person moved in (automatically or by hand) is sent a
  WhatsApp message saying a place opened up and they are now registered, with a button to their
  link. It uses a new template the organiser creates and gets approved in Meta (Utility
  category), name `ecphub_waitlist_moved_in`, body variables {{1}} = first name,
  {{2}} = event name, URL button `/a/{{1}}` like the existing templates. Until that template is
  approved, or when the person has no Malaysian mobile number, people are still moved in and the
  send is recorded as failed/skipped like any other send; it never blocks the move.
- **D685 — Admin waiting-list view.** Attendees gains a **Waiting list (N)** view (beside
  Cancelled / Cancellation requests) listing, in order: position, name, email, mobile, joined
  date. Per row: **Move in** (works any time, even when full or closed — an organiser override;
  sends the D684 message) and **Remove** (takes them off; no message). Admins and committee
  alike, as the other Attendees views.
- **D686 — The count is visible.** The Attendees subtitle and the Settings field show
  "X of LIMIT places taken" when a limit is set, so the organiser can see how full it is.

## Non-goals

- Exporting the waiting list (can come later).
- Emails of any kind; only the WhatsApp message.
- A message when someone joins or leaves the waiting list, or when registration closes with
  people still waiting.
- Limits per category, per ticket type, or on admin-added/imported people.
- Showing the attendee how many places are left before it is full.

## Anti-goals (failure even if it "works")

- More form registrations than the limit because two people pressed Register for the last place
  at the same moment.
- A person moved in twice, two people moved into one place, or someone skipped in the queue.
- A waiting-list person able to use the portal (book activities, check in, appear in counts,
  lists, exports, WhatsApp broadcasts, groups, leaderboards) before they are moved in.
- Someone moved in after registration closed without an organiser doing it.
- Losing a person's answers between joining the list and being moved in.
- Events with no limit behaving any differently from today.

## Constraints

- Today every read of `attendees` must filter `cancelled_at is null` or carry an `any-status:`
  marker (D590/D591, `tests/attendee-reads-guard.test.ts`). Any design where waiting-list people
  live in `attendees` must keep every existing reader (counts, lists, exports, broadcasts,
  scanners, activities, groups, games) from seeing them.
- Registration and admin Add both go through `upsertByEmail` (`src/lib/db/attendees.ts`), which
  also reactivates a cancelled row (D587). A cancelled form registrant registering again counts
  as a new form registration for the limit.
- The approve-cancel path's `cancelAttendee` returns true only when that call set the mark
  (`src/features/cancel/db.ts`) — the natural "a place just freed" signal. Admin delete paths are
  `deleteAttendee` / `deleteAttendees` in `src/lib/db/attendees.ts`.
- Automatic WhatsApp sends already exist (`notifyRequestDecision` via `runSend`, dedupe keys,
  `whatsapp_sends` log); the new send should follow that pattern and never throw into the action.
- Templates are frozen on Meta approval; the link carries only the token (`/a/{{1}}`).
- Personal data: waiting-list people are personal data like attendees and must go with the
  event's purge (`purgeAttendeePersonalData`).
- The registration page's open/closed test is currently duplicated in three places
  (`register/page.tsx`, `register/actions.ts`, `registrationOpenNow` in the cancel feature);
  "full" must be decided once, the same way, in all of them.

## Decided how

- **D687 — Waiting-list people live in their own table, not in `attendees`.** *(My call.)* A
  `registration_waitlist` table holds each entry: event, name, email, answers (`extra`), consent
  and terms times, token, joined time, and when it ended (moved in / left / removed, with which).
  Moving in creates (or reactivates) the attendee through the normal path with the entry's token,
  answers and consent, `source = 'registration'`, and closes the entry. This keeps every existing
  `attendees` reader correct without a sweep, and keeps the person's link the same before and
  after (tokens must stay unique across both tables).
- **D688 — The full/not-full decision and every move-in happen in one database transaction**
  (a Postgres function that locks the event row), so the last place cannot be taken twice and two
  frees cannot move the same person in. *(My call; the exact function shape is the builder's.)*
- **D689 — The token link resolves waiting-list entries too.** `/a/<token>` and the event's token
  layout look in the waiting list when no attendee has the token, and show the D680/D681 pages.
  `loadPortalAttendee` keeps refusing anyone who is not a registered attendee.
- **D690 — When the "You're in" page is on (D634)**, joining the waiting list does not show it;
  joiners always land on their link's waiting-list page.

## Settled after review (my calls, for the organiser to check)

- **D691 — The queue is never skipped.** While a limit is set, the event counts as full when the
  places are taken **or anyone is waiting**, so a newcomer can never take a place ahead of the
  waiting list. When registration reopens (switch on, close time moved later, un-archived) with
  free places and people waiting, they are moved in first, in order, before anyone new can
  register. Clearing the limit moves everyone waiting in (immediately if registration is open,
  otherwise when it reopens).
- **D692 — People already registered are never sent to the waiting list.** An active attendee
  (imported, added or registered) who submits the form while it is full is updated and sent to
  their link as today. A **cancelled** person (whatever their original source) who registers
  again through the form counts as a new form registration: they take a place if one is free
  (their row becomes `source = 'registration'`), otherwise they join the waiting list. Moving
  someone in always sets `source = 'registration'`, so they use up a counted place.
- **D693 — If a waiting-list person is added by an organiser** (Add attendee or masterlist import,
  same email), their waiting-list entry closes as "added by the organiser"; they are registered
  by that action, not counted against the limit, and get no message.
- **D694 — Organiser overrides can go past the limit.** Restore (D588) and Move in (D685) both work
  when full; the count then shows over the limit (e.g. "52 of 50"), and nobody is moved in
  automatically until places drop back below the limit.
- **D695 — Losing the race, and keeping links.** Someone who submits the normal form after the
  last place went is put on the waiting list automatically (their answers and ticks are kept) and
  lands on their waiting-list page, which says the event filled up while they were registering.
  Someone who submits the waiting-list form when a place is free and nobody is ahead of them is
  registered straight away. A returning cancelled attendee keeps their **existing token** for
  their waiting-list entry, so earlier links and QR codes keep working once they are moved in.

## Left to the builder

- Table/column names, the transaction function's signature, and how the token link finds a
  waiting-list entry.
- Exact page wording beyond the labels above, following the portal's existing tone.
- Whether "Move in" over the limit asks for a confirm.
- Test strategy beyond: the race on the last place, double-free, closed-registration (no auto
  move), raise/clear limit, cancelled-then-re-register, re-join keeps position, leave, purge, and
  every promotion trigger sending exactly one message.

## Amendment: registrations that need approval (D696–D703)

Some events want each registration confirmed by the organiser before the person is in.

- **D696 — A per-event switch.** Settings → Registration gains **Registrations need approval**
  (off by default). Off: everything above applies unchanged.
- **D697 — Pending.** With it on, submitting the form (or the waiting-list form when a place is
  free) makes the person **pending**, not registered. A pending person **holds a place**: the limit
  counts form registrations **plus** pending people, so once registered + pending reaches the
  limit, new people go to the waiting list. Their link shows **Your registration is waiting for
  the organiser's approval**; they cannot use the portal yet. They can withdraw it themselves at
  once (with a confirm), which frees the place.
- **D698 — Admin "Pending approval (N)".** Attendees gains this view (oldest first: name, email,
  mobile, applied date, their answers in the detail) with **Approve** and **Decline** per row.
  The sidebar Attendees badge adds the pending count to the cancellation-request count. Admins and
  committee alike.
- **D699 — Approve.** The person becomes a registered attendee (`source = 'registration'`,
  counted, can use the portal on the same link) and is sent a WhatsApp message: new Utility
  template `ecphub_registration_approved`, {{1}} = first name, {{2}} = event name, URL button
  `/a/{{1}}`. As with D684, a missing template or number never blocks the approval. Approve works
  whether or not registration is still open.
- **D700 — Decline.** No WhatsApp. Their link shows **The organiser couldn't confirm your place
  for this event.** The place frees, and (while registration is open, D683) the first person on
  the waiting list moves into **pending** for the organiser to approve — not straight into
  registered, and with no message at that point; they get the D699 message when approved.
- **D701 — With approval on, nothing becomes registered without an organiser.** Every automatic
  move from the waiting list (D682, D691) goes to pending instead of registered, and the D684
  "moved in" message is not sent; Move in by hand (D685) also goes to pending. Imported and
  admin-added people never need approval (D677).
- **D702 — Registering again.** A declined or withdrawn person who submits the form again starts
  over: pending if a place is free, otherwise the waiting list. *(My call.)*
- **D703 — Switching approval off or on.** Turning it off leaves anyone already pending as
  pending until the organiser decides; turning it on never touches people already registered.
  *(My call.)*
- **Data (amends D687).** Pending people live in the same table as the waiting list, as a second
  state of an entry (waiting, pending, declined, withdrawn/left, removed, registered), so no
  existing `attendees` reader can see them. Approve creates or reactivates the attendee exactly
  as moving in does. *(My call.)*

