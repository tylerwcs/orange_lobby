-- Announcements and info tabs can be for some attendees only, the way agenda rows and
-- activities already are: one event can run several programmes side by side (KOM, YEP,
-- Wellness), and a YEP-only notice means nothing to somebody in KOM. Null means everyone, as it
-- does on agenda_items and activities, so every existing row stays visible to everybody.
alter table announcements add column categories text[];
alter table info_tabs add column categories text[];
