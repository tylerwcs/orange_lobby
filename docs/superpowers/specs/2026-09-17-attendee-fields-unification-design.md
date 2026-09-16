# One kind of field: retiring collected_fields

**Status:** proposed, 17 Sep 2026
**Supersedes:** migration 0008's premise (`collected_fields`)

## The problem

An event has two kinds of attendee fact, and the difference between them is an accident of
what got built first.

`company`, `phone` and `table_no` are columns on `attendees`, hardcoded in the public
registration form, aliased in the masterlist importer, listed as built-in table columns,
and switched on or off per event by `events.collected_fields` — a settings panel titled
"What this event collects". Everything else an event wants to know — dietary, shirt size,
hotel room — is an `AttendeeField`: defined per event, stored in `attendees.extra`, and
added either as a registration question or as an admin column.

The panel reads as a rule about what is compulsory, and it is not one. It names name,
email and category as always collected and then offers three fixed toggles, which is both
arbitrary (why is "Company" a system concept and "Job title" not?) and limiting (an event
that wants a company field with a different label, or a second one, cannot have it).

Only name, email and category are genuinely compulsory: the importer matches on email, and
the agenda decides who may see which session by category. Everything else is a field.

## Decisions

1. `company`, `phone` and `table_no` become ordinary fields. Their values move into
   `attendees.extra` under the same keys, and the three columns are dropped.
2. `collected_fields` — the column, `src/lib/collected-fields.ts`, and the settings
   section — is deleted. Whether an event collects something is answered by whether a
   field for it exists.
3. Name, email and category stay columns on `attendees` and stay compulsory.
4. Registration questions gain `phone` and `number` types, so a phone field still renders
   as `type="tel"` and still raises a number keypad on a mobile.
5. The change ships as expand → backfill → contract, across two deploys.
6. The scan-card field picker becomes a searchable combobox over the unified field list,
   and moves from Event details to the Checkpoints tab.

## The model afterwards

```
attendees:  id, token, name, email, category, extra jsonb, source, status, …
events:     registration_questions jsonb   -- fields asked at sign-up
            attendee_fields        jsonb   -- fields admins fill or import
```

`AttendeeField` is `{ key, label, type, options? }` with
`type: "text" | "phone" | "number" | "date" | "select"`. `RegistrationQuestion` gains
`phone` and `number` to its existing `text | select`. `eventFields()` already merges the
two lists and stays the single source of truth for "every field this event has".

The two lists remain separate, because they answer different questions — *did the attendee
tell us* versus *did we write it down* — and merging them is a larger change that buys
nothing here. Table number is the clearest case: it is assigned after seating and imported
from a spreadsheet, never asked at registration.

`RESERVED_KEYS` in `attendee-fields.ts` loses `company`, `phone`, `table` and `table_no`;
they are ordinary keys now. It keeps `id`, `name`, `email`, `category`, `token`, `source`,
`status` and `extra`, which are still the row's own.

## Approach: expand, backfill, contract

This is the pattern `floorPlanUrl()` already documents in `src/lib/modules.ts` — a column
migrated into jsonb in one deploy and read in another. The pilot event is live with 43
attendees, so no step may depend on another having been perfect.

### Step 1 — Expand (deploy 1, migration 0014)

The migration gives every event real field definitions for whatever it collects today, and
copies every attendee's values across:

```sql
-- company and phone become registration questions, because that is what the public form
-- asks today; table_no becomes an attendee column, because it is assigned, never asked.
-- Only for events whose collected_fields actually lists them, and only where no field of
-- that key exists already.
update events set registration_questions = registration_questions
  || jsonb_build_object('key','company','label','Company','type','text','required',false)
  where 'company' = any(collected_fields)
    and not registration_questions @> '[{"key":"company"}]'
    and not attendee_fields        @> '[{"key":"company"}]';
-- …the same for phone (type 'phone'), and for table_no into attendee_fields (type 'text').
-- Sketched here; the implementation plan carries the statements in full, with the
-- scan_extra_fields seeding described under "Scan card".

-- Values: only where there is something to copy, and never over a key that already exists.
update attendees set extra = jsonb_strip_nulls(
  jsonb_build_object('company', company, 'phone', phone, 'table_no', table_no)) || extra
  where company is not null or phone is not null or table_no is not null;
```

`|| extra` last means an existing `extra` key always wins over the column.

Nothing is dropped in this step. The columns and `collected_fields` stay, and the deploy
can be rolled back.

The code in this deploy reads every field through one accessor:

```ts
/** A field's value: `extra` first, then the legacy column. Deleted in the contract step. */
export function fieldValue(a: Attendee, key: string): string
```

The fallback is keyed on **absence**, not emptiness: `key in a.extra` settles it. An
organiser who clears a company writes `extra.company = ""`, which is present, so the old
column does not resurrect it. Writes go to `extra` only — no dual-writing, which means no
window in which the two disagree about which is authoritative.

### Step 2 — Backfill verification

Run in the SQL editor before the second deploy; both must return zero:

```sql
select count(*) from attendees where company is not null and not extra ? 'company';
select count(*) from attendees where phone   is not null and not extra ? 'phone';
select count(*) from attendees where table_no is not null and not extra ? 'table_no';

select count(*) from events where collected_fields <> '{}'
  and not (registration_questions || attendee_fields) @> '[{"key":"company"}]'
  and 'company' = any(collected_fields);
```

### Step 3 — Contract (deploy 2, migration 0015)

```sql
alter table attendees drop column company, drop column phone, drop column table_no;
alter table events drop column collected_fields;
```

`fieldValue`'s fallback branch and the three keys on the `Attendee` type go with it. This
step is irreversible, which is why it is a step of its own, run days after the data has
been checked and the event has been used.

## What changes, by area

### Registration

- `validateRegistration` stops special-casing `phone` and `company`; every answer is a
  question, and everything lands in `extra`. `RegistrationData` becomes
  `{ name, email, extra }`.
- `parseQuestions` accepts `phone` and `number`. A `phone` question renders `type="tel"`,
  a `number` question `type="number"`; neither gains format validation — an events team
  that wants "+60…" typed a particular way says so in the question's description, and a
  rejected phone number at a registration desk costs more than a messy one.
- `RegisterForm` loses its `collects` prop and renders questions only.

### Import

- `masterlist.ts` keeps its header aliases (`Mobile` → `phone`, `Table` → `table_no`) but
  they now resolve against `eventFields()` like every other column, and the values land in
  `extra`. A header matching no field on the event is ignored exactly as today.

### Admin

- `columns.ts`: `BUILTIN_COLUMNS` keeps email, category, checked-in and source;
  `OPTIONAL_KEYS` and the `collected` argument to `allColumns()` and `bulkFields()` go.
- `AttendeeTable` / `AttendeeDetail` / the add-attendee form render fields from
  `eventFields()` instead of three conditional built-ins.
- Search: `buildAttendeeSearchFilter` matches company through jsonb
  (`extra->>company.ilike.%…%`) instead of the column. The crew-facing name-only filter is
  unchanged — D98/D99 still hold, and this must not quietly widen what a crew search can
  probe.

### Portal and badge

- `pinned-fields.ts`: `NATIVE_PINNABLE` keeps email and category; company, phone and table
  arrive as event fields, so they remain pinnable without being special. Pins already
  stored under those keys keep resolving, because `pinValue` reads `extra` for anything
  non-native — which, after the backfill, is where the value is.
- `BadgeCard`'s hardcoded company line reads through `fieldValue`, and shows nothing when
  the event has no company field.
- The seat page and the seat tile read `table_no` as a field.

### Scan card

- `scanResultFields` stops gating on `collected_fields`. The card shows Category, then the
  fields the event chose.
- **The cap rises from 2 to 4.** Today the card shows up to three built-ins plus two
  extras; leaving the cap at two would be a visible regression for crew at a door. The
  migration seeds `scan_extra_fields` with what each event shows today — `company` and
  `table_no` where collected — so the card is unchanged on the day.
- `scanResultFields` resolves a configured name by key **or** label, so values stored by
  the old free-text box keep working and a key stored by the new picker still shows its
  proper label rather than `shirt_size`.

### Scanner settings

- The "Onsite scanner" section moves to the Checkpoints tab, next to the checkpoints the
  scanner runs.
- That tab sits outside the single settings form — the one SaveBar spans Event details and
  Registration only — so the section gets its own form and its own
  `updateScanFieldsAction`, with its own Save. Nesting it in the big form is not an
  option: the Checkpoints tab already contains forms of its own.
- The free-text key box becomes `FieldPicker`, a client component over the existing
  popover and input: a trigger showing the chosen labels, a filter box, and the event's
  fields as checkable rows. At the cap the unchosen rows disable rather than the save
  silently truncating, which is what `.slice(0, 2)` does today. It posts one hidden input
  per choice, read with `getAll()`.

## Sequencing

Three pieces of work, and they are independent enough to be planned separately:

1. **Expand** — the field model, migration 0014, the `fieldValue` fallback, and every
   reader and writer moved onto fields. One deploy.
2. **Contract** — migration 0015 and the deletion of the fallback. Days later, after the
   verification queries pass.
3. **Scanner picker and tab move** — `FieldPicker`, `updateScanFieldsAction`, the cap, and
   the key-or-label resolution. Depends on (1) only for the field list it offers, so it can
   land with it or after it, but not before.

## Testing

Pure logic first, as the repo does — every item below is a failing test before it is code:

- `attendee-fields`: the new types parse; `phone`/`number` survive a round trip; the
  un-reserved keys can now be created; a bad type still falls back to text.
- `registration`: a phone question validates and lands in `extra`; `RegistrationData` no
  longer carries company or phone.
- `columns` / `bulk`: `allColumns()` and `bulkFields()` without the collected argument.
- `pinned-fields`: a pin stored as `company` resolves from `extra`.
- `scan`: resolution by key and by label; the cap; category always present.
- `masterlist`: a `Mobile` header lands in `extra.phone`.
- `fieldValue`: `extra` wins; absent key falls back to the column; empty string does not.

The fallback tests are deleted with the fallback in step 3.

Browser verification before each deploy: register an attendee with a phone question,
import a masterlist with Company and Table headers, check the attendee table and detail,
scan a badge, and open the portal badge and seat pages.

## Risks

- **The drop is irreversible.** Mitigated by the two-deploy split and the verification
  queries, not by hoping.
- **Export layout.** Today's sheets emit Name, Email, Phone, Company, Category, Table,
  Source, then extras. A client may have a process reading those positions, so the
  exporters keep emitting those columns in that order when the event has fields for them,
  rather than letting them drift into the extras block.
- **Pins and scan fields are stored strings.** Both resolve through `extra` after the
  backfill; both are covered by tests above, and both fail soft already (a pin that
  resolves to nothing renders nothing).
- **The live pilot.** KOM is 30 Sep 2026. Step 3 should not land in the week before it.

## Out of scope

- Merging `registration_questions` and `attendee_fields` into one list.
- Date and choice rendering on the public registration form beyond what exists.
- Any change to category's behaviour, or to check-in.
