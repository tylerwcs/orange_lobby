-- Pictures on the agenda, and in the info page (D160).
--
-- Both columns hold a plain URL, exactly as events.logo_url and events.banner_url already
-- do (0013_event_media.sql). Nothing here knows about the bucket: an organiser who pasted a
-- link before uploads existed and an organiser who uploaded one leave the same kind of value
-- behind, and only `mediaPathFromUrl` cares which is which — it returns null for a URL we
-- did not store, so a pasted link is never chased by a delete.
--
-- Nullable with no default, because most sessions have no picture and a row that says
-- nothing about an image is the common case, not a missing value.
alter table agenda_items add column if not exists image_url text;

-- The agenda's own banner, above the day. It sits on the event rather than on a day, so a
-- multi-day event shows one masthead rather than asking for a fresh image per morning.
alter table events add column if not exists agenda_banner_url text;

-- The info page needs no column: its images live inside events.info_page_html as <img>
-- tags, which sanitizeHtml already allows with an https src.
