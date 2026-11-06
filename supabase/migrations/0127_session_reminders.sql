-- 0127: a WhatsApp reminder before each booked session (D836).
--
-- Per booking activity: how many minutes before a session its bookers are reminded. Null is
-- off. Only a booking has sessions, so no other kind may carry one.
alter table activities add column whatsapp_reminder_minutes smallint;
alter table activities add constraint activities_reminder_minutes check (
  whatsapp_reminder_minutes is null
  or (kind = 'booking' and whatsapp_reminder_minutes between 5 and 720)
);
