# Form submissions — design

Date: 2026-09-23
Status: awaiting user review
Decisions D161–D171. Reuses the question engine that `registration_questions` introduced.

## 1. Why

Registration already collects facts about a person once, at sign-up: shirt size, room
preference, dietary needs (`docs/kom-registration-questions.json`). Activities already let an
attendee claim a seat. Neither can model **the same person answering the same questions more
than once** — a daily wellness check-in across a ten-week programme, a photo entry, an
expense claim. `attendees.extra` is one flat map per person, and a booking is one seat per
session.

That is the gap: **repeatable, identified submissions**.

### What this spec is not

The organiser's full job around submissions is four separate things, and this spec is the
first only:

1. **Forms, submissions, export** — this document.
2. Who hasn't submitted — the chasing list, the job `unbookedByActivity` does for activities.
3. Participation over time — counts per day, streaks. A reporting surface.
4. Review and approval — a queue, mirroring activity change requests (D142–D158).

2, 3 and 4 are pure additions over the table this spec defines: two are reads, and the third
is a status column (which **is** included here, see D170) plus a screen. Each gets its own
brainstorm against a foundation that exists, which is a much sharper conversation once a week
of real submissions is in the database.

Also deliberately out of scope: anonymous forms (incompatible with a per-attendee cap — see
D163), editing or deleting a submission (D166), scheduled open/close (D127 already decided
this for activities: flipped by hand), and multi-value answers.

## 2. Shape

- **D161** Forms get **their own two tables**, `forms` and `form_submissions`, rather than
  columns on `activities`.

  The activities *policy* shape is what branches here — categories, an open flag, a
  per-attendee cap, a sort order. The *mechanics* do not: a booking is a seat in a session,
  with a capacity, a roster and `unique (attendee_id, session_id)`. A submission has no seat,
  no session and no capacity. Folding forms into `activities` would mean nullable session
  columns everywhere and a session that is not a session.

  This is the same call D122 made when activities got new tables instead of more columns on
  `agenda_items`, for the same reason: the policy fields had nowhere to live.

- **D162** The **question engine is shared** with registration, not copied.
  `RegistrationQuestion`, `parseQuestions` and the answer-validating half of
  `validateRegistration` already do labels, types, required, options, descriptions and
  conditional `show_when`. Two engines would drift, and this codebase already carries the
  scar tissue about two implementations of one rule disagreeing.

  Shared does not mean identical — see D164 for the per-context type allowlist.

- **D163** Submissions are **identified**, never anonymous. This follows from the cap rather
  than being chosen: counting "how many times has this person submitted" requires knowing
  who they are. An anonymous feedback form is a different feature with a different table,
  and is not this one.

## 3. Schema

```sql
create table forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  description text,
  -- The same jsonb shape events.registration_questions holds, validated by the same zod
  -- schema against a wider type allowlist (D164).
  questions jsonb not null default '[]'::jsonb,
  -- Flipped by hand. No scheduled close, exactly as D127 decided for activities.
  submissions_open boolean not null default false,
  -- Null or empty means everyone, the same rule as agenda_items and activities.
  categories text[],
  -- The TOTAL a person may ever submit to this form. Null means no total limit.
  max_per_attendee int check (max_per_attendee is null or max_per_attendee between 1 and 366),
  -- At most one submission per Malaysian calendar day, on top of any total (D171).
  per_day boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table form_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  form_id uuid not null references forms(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  -- { question key -> answer }. A `file` answer holds an OBJECT PATH, not a URL (D167).
  answers jsonb not null default '{}'::jsonb,
  -- The Malaysian calendar day this counts against (D165).
  submitted_on date not null,
  -- Room for the review queue that is not being built yet (D170).
  status text not null default 'submitted',
  -- Denormalised from the form so the partial unique index below needs no join (D165).
  per_day boolean not null,
  created_at timestamptz not null default now()
);

create unique index form_submissions_one_a_day
  on form_submissions (form_id, attendee_id, submitted_on)
  where per_day;

create index form_submissions_form_idx on form_submissions (form_id, submitted_on desc);
create index form_submissions_attendee_idx on form_submissions (attendee_id);
create index forms_event_idx on forms (event_id, sort_order);

alter table forms enable row level security;
alter table form_submissions enable row level security;
-- No policies, as every table since 0001_init.sql: only the service role may touch data.
```

- **D164** `parseQuestions` takes the **allowed types** as an argument. Registration keeps
  `text | phone | number | select`; forms add **`textarea`** and **`file`**.

  A file upload has no business on the registration form: there is no attendee row yet to
  attach it to, and registration is open to the public. Sharing the schema while narrowing
  the enum per context is what lets one engine serve both without registration inheriting a
  type it cannot support.

- **D165** `submitted_on` is a **stored date in Malaysian time**, and `per_day` is
  **denormalised onto the submission**.

  Stored rather than derived because `date(created_at)` is a UTC question and this app is not:
  `nowInKL` exists precisely because the working day here is UTC+8, and a derived date would
  roll a check-in made at 7am into the previous day.

  Denormalised for the reason `activity_bookings` carries `activity_id` and
  `breakout_assignments` carries `slot` (D80, D124): a partial unique index cannot join to
  another table. It brings the same obligation — **changing a form's `per_day` must rewrite
  its submissions** — and the same failure mode, which is handled rather than ignored:
  turning `per_day` on for a form that already has two submissions from one person on one day
  violates the index, so the save is refused and names the attendee and the day. That is the
  shape `updateBreakoutRoundAction` already uses when `renameSlotAssignments` collides.

- **D171** `per_day` and `max_per_attendee` are **two separate dials**, and only these
  combinations exist:

  | `per_day` | `max_per_attendee` | Behaviour |
  |---|---|---|
  | false | null | Unlimited — a log or a photo feed |
  | false | 1 | Once, ever |
  | false | N | Up to N, whenever |
  | true | null | Once a day, for as long as the form is open |
  | true | N | Once a day, up to N days in total |

  `per_day` means **at most one per day**, never "N per day". Offering "three per day" would
  need a second counter and a second index, and no use case asked for it: a daily check-in is
  daily. The unique index enforces the daily rule and `submit_form` enforces the total, so
  the two dials never contend for the same constraint.

  Naming this explicitly because the first draft of this spec left it undefined, and the
  reading it invited — `per_day` scoping the cap rather than standing beside it — would have
  produced a form that advertised three submissions a day and rejected the second.

## 4. Writing a submission

- **D166** A submission is **immutable**. An attendee sees their own history and cannot edit
  or delete it. Tuesday's check-in stays Tuesday's answer, an organiser reading yesterday's
  export finds it unchanged tomorrow, and a row never changes under a reader.

- **D167** **One database function, `submit_form`, is the only thing that may insert.**

  `count(*)` then `insert` is two statements and supabase-js has no transaction, so two
  phones at the cap both read "one short" and both get in. This is the same race `book_session`
  documents at D125, so it takes the same shape: lock the form row, re-count under that lock,
  insert or refuse.

  ```
  submit_form(p_form_id uuid, p_attendee_id uuid, p_answers jsonb, p_today date) returns text
  ```

  Returns a **reason code**, not a boolean, for the reason D140 gives: the portal says
  different things for a form the desk closed and a form this person has already filled in
  today. Codes: `ok`, `missing`, `closed`, `ineligible`, `limit`, `duplicate`.

  Eligibility uses the same trimmed, case-folded category comparison `book_session` uses,
  because these values are typed by hand.

  `p_today` is passed in rather than computed with `current_date`, so the Malaysian day is
  decided in one place (`nowInKL`) rather than depending on the database server's timezone.

  A `file` answer holds the **object path**, not a URL. Signed URLs expire, so a stored URL
  would be a link that works for a week and then silently does not.

- **D170** Submissions carry a **`status`, defaulting to `'submitted'`**, although nothing
  reads it yet.

  The review queue is piece 4 and is not being built here, but the column costs one word in
  a migration today and a backfill over live rows later. A daily check-in across a ten-week
  programme accumulates thousands of rows; adding a NOT NULL column to that table once it
  is full is a different job from adding it to an empty one.

  Nothing branches on it, no index covers it, and no screen shows it. It is deliberately
  slack in the schema, and the next spec decides what values it may hold.

## 5. Uploaded files

- **D168** Submission files go in a **new private bucket, `form-uploads`**, served through
  short-lived signed URLs. They do **not** go in `event-media`.

  `event-media` is public on purpose (0013): a logo and a floor plan are public by nature,
  the portal is open to anyone with a link, and the images render in plain `<img>` tags.
  An attendee's photo or receipt is a different kind of object. "Nobody will guess the
  filename" is not access control, and the difference between a public and a private bucket
  here is the difference between a feature that can be handed to two hundred employees and
  one that cannot.

  Mechanics mirror `src/lib/db/media.ts`: the upload travels through a Server Action written
  with the service role, so the bucket needs no write policy and the anon key can never put
  anything in it. Reads go through `createSignedUrl(path, 60)`.

  `src/lib/storage.ts` gains `submissionObjectPath` and its own accept list — images plus
  PDF, 10 MB — kept separate from `acceptImage` rather than widened, because an event logo
  should still not be a PDF.

- **D169** **Deleting a form deletes its files.** The cascade takes the rows; the objects
  need removing explicitly, in the action, before the row goes — the same ordering
  `deleteAgendaItemAction` uses (D160), and for the same reason: afterwards there is nothing
  left to ask which files were ours.

  **`purgeAttendeePersonalData` must purge submissions too.** As of D172 it clears name,
  email, seat and every registration answer in one atomic statement — but it knows only
  about the `attendees` table, and would walk straight past a table full of that person's
  answers and photographs. It gains: delete this attendee's submission files from the
  bucket, then delete their `form_submissions` rows, inside the same function so the
  all-or-nothing guarantee D172 just bought is not given back. A purge that leaves the
  personal data in a second table is not a purge.

## 6. Surfaces

**Portal.** `/e/<slug>/a/<token>/forms` lists the forms this attendee is eligible for, each
showing whether it can be filled in now and how many times they have submitted.
`/forms/<id>` renders the questions and, below them, their own submissions newest first.
`TILE_ROUTES` gains `"forms"` so a tile can point at it, and `TILE_ROUTE_LABELS` gains its
label — the type is `Record<TileRoute, string>` precisely so adding one without the other is
a compile error.

**Admin.** `/admin/events/<id>/forms` lists and creates; `/forms/<id>` edits the questions
and shows submissions newest first, with the day, the attendee, the answers and any file as a
signed link. The nav gains **Forms** under *Portal*, beside Activities. The question editor
is the registration editor's component, given the wider type list.

**Export.** `/export/forms.xlsx`, one sheet per form: attendee, email, category, the day, the
timestamp, then one column per question key. A `file` answer exports as a **signed URL valid
for seven days**, and the column header says so — a spreadsheet worked today should open its
photographs, and a link that silently dies next month is worse than one that says when it
expires.

## 7. Testing

**Pure, and therefore the bulk of it.** Extracting `validateAnswers` from
`validateRegistration` is the enabling refactor: registration keeps its name/email rules and
delegates the question loop, so one tested function serves both.

- `validateAnswers` — required, select options not on the list, `show_when` hiding a question
  and clearing its answer, the two new types.
- `parseQuestions` — a `file` question is **rejected** for registration and accepted for a
  form. This is the test that stops D164 quietly eroding.
- `canSubmit(form, mine, today)` — the portal's decision, in the shape `activityState`
  already uses: closed, ineligible, at cap, already today, or go ahead. Every reason code the
  function returns has a counterpart here so the button and the database agree.
- `submissionObjectPath` and the accept list, as `tests/storage.test.ts` already covers the
  image equivalents.

**Against the database.** A concurrency script mirroring `scripts/booking-concurrency.mjs`
(`npm run check:booking`), proving two simultaneous submissions cannot exceed a cap of one,
and that a `per_day` form rejects the second submission on the same Malaysian day. The
booking equivalent exists because the bug it catches is invisible to unit tests, and the same
is true here.

## 8. Build order

1. Migration, types, `parseQuestions` allowlist, `validateAnswers` extraction — with tests.
2. `submit_form` and the concurrency script.
3. Admin: list, question editor, submissions table.
4. Portal: list, form page, history.
5. Uploads: bucket, accept list, signed reads, purge and delete paths.
6. Export.

1 and 2 are the parts that are painful to change later. 5 can be cut to ship sooner — a form
of text, number and select questions is useful on its own, and `file` is additive.
