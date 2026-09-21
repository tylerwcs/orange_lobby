# Activities verification

Applies once `feat/activity-booking` is deployed. This is **not** part of the 23 Sep dry run:
the design doc sequences the whole feature after the 30 Sep KOM pilot, and nothing about the
23 Sep checklist depends on it. Treat this list the same way — pass-or-block — for whichever
event first runs with activities turned on.

## Activities (admin — needs a logged-in organiser)

- [ ] Activities appears in the Portal group of the sidebar
- [ ] Add an activity with two sessions; the list shows 0 / <capacity> seats
- [ ] Booking open / Closed toggles and the badge follows
- [ ] Delete an activity with sessions and bookings; the confirm dialog names both counts, and everything is gone after
- [ ] Add a session; it appears with 0 / <capacity>
- [ ] Reorder sessions with the drag handle, then with the keyboard
- [ ] Not-booked list shows the right people and excludes anyone outside the categories
- [ ] Place three people into a session; the flash counts them
- [ ] Place people into a session with one seat left; the flash says how many were refused
- [ ] Close booking, then place somebody — placement still works
- [ ] Delete a session with bookings; the confirm dialog names them
- [ ] Activity rosters download opens in Excel; one sheet per session, names in alphabetical order
- [ ] A session with no bookings still gets a sheet, with a header and no rows
