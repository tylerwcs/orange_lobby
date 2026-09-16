-- The facts an event wants on the front of an attendee's badge card.
--
-- Which facts those are is a per-event decision that changes with the client: this event
-- wants the hotel room number, the next wants who you are sharing a room with. So the
-- badge card's bottom row is no longer a hardcoded table number — it is generated from
-- this list, in this order, and the first entry gets the large treatment.
--
-- Shape (validated in src/lib/pinned-fields.ts, not by the database):
--   [{ "key": "table_no" }, { "key": "room_partner", "label": "Partner" }]
--
-- `key` names either a column on the attendee row or a key in its `extra`; `label` is an
-- optional short caption, because a column named for an admin table ("Hotel room partner")
-- rarely fits above a value.
--
-- Additive with a default, so the currently deployed code — which does not know this
-- column exists — keeps working while the two deploys land in either order.
alter table events add column pinned_fields jsonb not null default '[]'::jsonb;

-- Every event that is already seating people by table keeps showing the table number,
-- which is what its badge card does today. Pinning it for an event where nobody has a
-- table would only put a ticked box in Settings for a field nobody filled.
update events e
set pinned_fields = '[{"key": "table_no"}]'::jsonb
where exists (
  select 1 from attendees a
  where a.event_id = e.id and a.table_no is not null and a.table_no <> ''
);
