-- An event's own terms on the registration form (D540-D542), next to our Privacy Notice tick:
-- a client's clauses (photography, eligibility, no-show charges) that the invitee must agree to
-- before registering.

-- D540: rich text, as the info page stores it. Null or empty is no terms and no second tick.
alter table public.events add column if not exists registration_terms text;

-- D542: when this attendee ticked the event's terms on the form. Null for anyone who registered
-- before the event had terms, or who came in by import or walk-in and never met the form.
alter table public.attendees add column if not exists terms_agreed_at timestamptz;
