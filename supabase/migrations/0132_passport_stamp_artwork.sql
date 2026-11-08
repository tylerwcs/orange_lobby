-- D844: a booth can carry the designer's stamp artwork, and a stamp remembers whether its
-- attendee has seen it arrive. A stamp collected while the passport's QR dialog was closed
-- (a badge scan, a screenshot of the QR) plays its reveal on the next visit, then is seen.
alter table booths add column stamp_image_url text;
alter table booth_stamps add column seen_at timestamptz;

-- Existing stamps were collected before the reveal existed: nobody gets a backlog.
update booth_stamps set seen_at = stamped_at where seen_at is null;
