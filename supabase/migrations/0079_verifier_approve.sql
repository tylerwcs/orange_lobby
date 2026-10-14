-- Verifier approvals (D518–D521). A note for the committee only: nothing scores, ranks or shows
-- attendees from these columns. Any edit clears both (D520), so an approval always means "this
-- exact answer was checked".
alter table public.activity_submissions
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_verifier uuid references public.verifier_links (id) on delete set null;
