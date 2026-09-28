-- Booking doors (D324): a checkpoint can stand for one booking activity on its day. Null is an
-- ordinary door, where everyone registered is expected. Deleting the activity keeps the door
-- and its check-ins as an ordinary one (D329); deleting the door still takes its check-ins.
alter table checkpoints
  add column activity_id uuid references activities(id) on delete set null;
create index checkpoints_activity_id_idx on checkpoints (activity_id);
