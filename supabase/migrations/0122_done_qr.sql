-- 0122: the confirmation page's QR code gets its own switch (D804), and the next step moves to
-- Settings -> Registration (D805).

-- D804: on by default, so every page that showed a QR still does. Only matters with check-in on.
alter table events add column registration_done_qr boolean not null default true;

-- D805: with the page off, a next step now sends registrants straight to the activity. An event
-- that has one set today shows the confirmation-and-next-step screen without a QR (D799), so it
-- keeps that: the page on, the QR off.
update events set registration_done_page = true, registration_done_qr = false
where after_register_activity_id is not null and not registration_done_page;
