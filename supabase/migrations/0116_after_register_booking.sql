-- 0116: the booking activity a new registrant is sent straight to (D766). One per event, so it
-- lives on the event; set from the activity's Setup tab. Deleting the activity clears it.
alter table events add column after_register_activity_id uuid references activities(id) on delete set null;
