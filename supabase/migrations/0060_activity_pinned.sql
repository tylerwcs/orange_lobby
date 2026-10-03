-- D387 — organisers can pin activities. A pinned one leads the attendee's home row and sits
-- under its own "Pinned" heading at the top of the Activities tab. Off by default, so every
-- activity keeps the place it has today.

alter table activities add column pinned boolean not null default false;
