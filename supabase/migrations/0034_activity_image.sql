-- An organiser's picture for a submission activity: a poster, the rules of a challenge, the
-- thing an attendee should look at before they fill the form in. Shown whole above the form.
--
-- Nullable with no default beyond null: every existing activity has none, and a booking
-- activity never will - the admin only offers the field on a submission activity. The file
-- itself lives in the public event-media bucket beside the event's other images, so this holds
-- its public URL, exactly as events.agenda_banner_url does.

alter table activities add column image_url text;
