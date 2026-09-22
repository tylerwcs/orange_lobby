# Activities verification

Applies once `feat/activity-booking` is deployed. This is **not** part of the 23 Sep dry run:
the design doc sequences the whole feature after the 30 Sep KOM pilot, and nothing about the
23 Sep checklist depends on it. Treat this list the same way — pass-or-block — for whichever
event first runs with activities turned on.

**Most of this was verified live on 21 Sep 2026**, driving the real admin in a browser against
`az-asia-rare-neurology-brand-forum` with the organiser signed in. `[x]` passed, `[~]` passed in
part, `[ ]` still owed. Every row created for that pass was deleted afterwards, and all three
activity tables were confirmed empty across every event.

## Activities (admin — needs a logged-in organiser)

- [x] Activities appears in the Portal group of the sidebar
- [x] Add an activity with two sessions; the list shows 0 / <capacity> seats
- [~] Booking open / Closed toggles and the badge follows
- [x] Delete an activity with sessions and bookings; the confirm dialog names both counts, and everything is gone after
- [x] Add a session; it appears with 0 / <capacity>
- [~] Reorder sessions with the drag handle, then with the keyboard
- [~] Not-booked list shows the right people and excludes anyone outside the categories
- [x] Place three people into a session; the flash counts them
- [x] Place people into a session with one seat left; the flash says how many were refused
- [x] Close booking, then place somebody — placement still works
- [x] Delete a session with bookings; the confirm dialog names them
- [~] Activity rosters download opens in Excel; one sheet per session, names in alphabetical order
- [ ] A session with no bookings still gets a sheet, with a header and no rows
- [ ] A pending request appears on its activity's page with the attendee, what they asked for, and how long it has waited
- [ ] Approve moves the booking and the request disappears from the queue
- [ ] Approving into a session that filled meanwhile refuses, says the session is full, and leaves the request pending
- [ ] Decline asks for confirmation, leaves the booking alone, and the request moves under "Show decided"
- [ ] "Show decided" names who decided and when
- [ ] Approving a switch works after booking has been closed
- [ ] Approving a cancel request removes the booking and reads "Cancel {session}" in the queue, not the switch copy
- [ ] Declining a cancel request leaves the booking in place and reads "Cancel {session}" under "Show decided"
- [ ] An activity with pending requests shows a waiting count on the list; one without shows nothing

## What the partial items still owe

- **Booking open / Closed toggles.** Opening was verified — the button flipped to "Close booking",
  the toast read "Booking open.", and the attendee portal began offering the sessions. Saving the
  Settings form afterwards was also checked, and correctly left booking open. Closing by hand was
  not exercised.
- **Reorder.** The keyboard path was verified: focusing a handle and pressing an arrow moved the row
  and announced "Negotiation lab moved to position 1 of 2" to the live region. The pointer drag was
  not exercised — it is the same `moveItem` call, but nobody has watched it work.
- **Not-booked list.** Verified that it lists the right people with their categories, shrinks as
  they are placed, and grows back when a session is deleted and its bookings cascade. No
  category-restricted activity was set up, so the exclusion rule rests on unit tests alone.
- **Activity rosters download.** The route was verified to return a genuine workbook — HTTP 200,
  the xlsx content type, `PK` zip magic, about 9 KB, and the filename
  `az-asia-rare-neurology-brand-forum-activity-rosters.xlsx`. Nobody opened it in Excel, so the
  sheet-per-session layout, the alphabetical ordering and the empty-session sheet are still owed.

## Attendee side, verified the same day

Driven at 375px, as an attendee holding a personal link:

- [x] The portal home shows an Activities card with a "Pick one" badge and the seats left
- [x] The activities page offers "Book" on a session with room and a plain "Full" on one without
- [x] Booking succeeds, the badge flips to "Booked", and the toast clears the bottom nav
- [x] A required activity with one session per person offers no Cancel
- [x] The booked session appears on the personal agenda in time order, with its room in the strong
      treatment and a "Booked" badge
- [ ] Switching between sessions from the attendee side (the second session was full at the time)
- [ ] Cancelling an optional activity from the attendee side
