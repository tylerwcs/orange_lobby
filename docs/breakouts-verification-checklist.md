# Breakouts — what the organiser must check

Date: 2026-09-16
Covers: breakout-room sessions added in `feat/breakouts`.

Every admin surface sits behind `requireAdmin()` and was not verified during implementation — entering credentials is not something the assistant does. This checklist is the only verification those surfaces will receive.

Run `npm run dev`, sign in, and work through these.

## Breakout setup and roster

1. [ ] Add four agenda items at the same time, all with slot "Breakout 1" and codes 3A–3D.

2. [ ] Import a masterlist with a "Breakout 1" column holding 3A/3B/3C/3D. Confirm the values land in the attendee table.

3. [ ] Run "Assign Breakout 1". Confirm the message counts the assignments and names any value that matched no room.

4. [ ] Deliberately put "Room 3B" in one cell and re-run. That row must be REPORTED, not silently dropped.

5. [ ] Run it a second time with overwrite unticked. Nobody already placed should move.

6. [ ] Move four people to another room from the attendee table's bulk bar.

7. [ ] Re-run "Assign from column" with overwrite unticked. Those four must STAY where you moved them.

8. [ ] Open the roster on the agenda page. Counts per room should add up, and the "with no room" badge should match the number of people you left out.

9. [ ] Download the roster export. One sheet per room, one for the unassigned.

## Personal experience

10. [ ] Open one attendee's personal link on a phone: their room on the agenda, one row per round on the Your breakouts card, and no other group's room anywhere.

11. [ ] Open an unassigned attendee's link: the placeholder with the desk's number, in both places.

## No breakout rounds

12. [ ] Open an event with no breakout rounds: no card, and an agenda unchanged from today.
