# Submit Together With Someone From Another Team — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One submission, tagged with one person from another team, creates a linked entry for both people. Each entry counts for its own team, and edits, deletes, revokes and approvals move both entries together.

**Architecture:**
- **Database:** two ordinary `activity_submissions` rows share a new `pair_id`. A new SQL function `submit_answers_pair` runs the existing `submit_answers` for each person inside one transaction (all or nothing).
- **Linked writes:** `db/activities.ts` looks up the row's `pair_id` and, if it has one, writes to both rows.
- **Rules:** the pure rules (who can be tagged, refusal wording, the "with" text) live in `src/features/activities/lib/pairs.ts` and are unit-tested.

**Tech Stack:** Next.js (app router, server components, Server Actions; check `node_modules/next/dist/docs/` for anything unfamiliar, per AGENTS.md), Supabase Postgres (plpgsql RPCs, service client), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-submit-with-partner-design.md` (D524–D535). Read it first.

## Global Constraints

- **Decision numbers** are D524–D535 and the migration is `0080`. Cite D-numbers in code comments the way the surrounding code does.
- **`activities.allow_pair`** is `boolean not null default false`. **`activity_submissions.pair_id`** is `uuid`, nullable.
- **Admin checkbox label, verbatim:** "Let people tag someone from another team".
- **Picker label, verbatim:** "Did this with someone from another team?" Its first option is "No one". The field name is `:with`.
- **Refusal messages, verbatim:**
  - `<name> is on your team. Tag someone from another team.`
  - `<name> isn't in a team yet.`
  - `You need to be in a team to tag someone.`
  - `<name> can't take part in this activity.`
  - `<name> already has an entry today.`
  - `<name> has reached the limit for this activity.`
  - `<name> needs to agree to the health-information consent on their own page first.`
- **The "with" line** reads `With <name>`.
- **Test only on ecpkom.** Never write to ecphub. Do not turn on `allow_pair` for ecphub's Project Active; that is the user's call.
- **Work on `main`.** Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push until the user says so.
- **Verification commands:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Use the Supabase MCP `apply_migration` / `execute_sql` on project `wfmqwwcolfigjylkgrsv`.

## Ruling carried from planning

**Spec D530 says the picker must be a client component, because it has to follow the "Submitting for" choice.** That isn't needed:
- A proxy can only ever submit for a member of their **own** group (D392, enforced in SQL).
- So the member's team is always the submitter's team.
- That makes the picker a plain server-rendered `<select>` that leaves out the submitter's team.

The spec is updated in Task 2's commit to say so.

## Review Focus

Most likely to bite first:

1. **The partner's insert is refused after the member's row was written.** No row may be left behind. Pinned by Task 1's SQL check: refused partner → zero new rows.
2. **A pair where one person was later deleted from the event.** The surviving entry keeps its photos and shows no "with" line. Pinned by Task 3's `deleteAttendees` guard, checked in Task 6, and by `withText` returning null for a missing partner (Task 2 test).
3. **A captain submits for a teammate and tags someone from their own team.** It must be refused as "on your team". Pinned by Task 1's SQL rule (compared with the member's group) and Task 6's browser check.
4. **Either partner deletes a pair entry the same day.** Both rows go, and the shared files are deleted exactly once. Pinned by Task 3's linked delete, and checked in Task 6.
5. **A verifier revokes one card of a pair.** Both rows are revoked with the same reason, and approving one approves both. Pinned by Task 3's linked writes, and checked in Task 6.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `supabase/migrations/0080_submit_pairs.sql` | Create | Columns, `submit_answers` with `p_pair_id`, `submit_answers_pair` |
| `src/lib/types.ts` | Modify | `Activity.allow_pair?`, `ActivitySubmission.pair_id?` |
| `src/features/activities/lib/pairs.ts` | Create | Pure: `PairCode`, `PairWho`, `pairCandidates`, `pairRefusal`, `withText` |
| `tests/activities/pairs.test.ts` | Create | Tests for the above |
| `src/features/activities/db/activities.ts` | Modify | `submitAnswersPair`, `linkedScope`, linked edit/delete/revoke/approve, `pairPartnerIds`, `NewActivity.allow_pair` |
| `src/lib/db/attendees.ts` | Modify | `deleteAttendees` keeps files a surviving partner row names |
| `src/features/activities/kinds/submission/settings.ts` | Modify | Reads `allow_pair` |
| `tests/activities/settings.test.ts` | Modify | Expects `allow_pair` |
| `src/features/activities/admin/ActivityRows.tsx` | Modify | The checkbox |
| `src/features/activities/kinds/submission/PairPicker.tsx` | Create | The `:with` select (server component) |
| `src/features/activities/kinds/submission/SubmissionBody.tsx` | Modify | `SubmitForm` renders `PairAsk`; `addedByLine` adds "With …" |
| `src/features/activities/kinds/submission/SubmissionHistory.tsx`, `scoring/tracker/EntryTimeline.tsx` | Modify | Show the line for paired rows too |
| `src/features/activities/portal/actions.ts` | Modify | Pair branch on submit; pair-aware duplicate check on edit |
| `src/features/activities/kinds/submission/SubmissionDetail.tsx`, `SubmissionTable.tsx` | Modify | "With …" in the admin table |
| `src/features/activities/verify/VerifyPage.tsx`, `VerifyCard.tsx` | Modify | "With …" on the verifier card |

---

### Task 1: Migration 0080 and types

**Files:**
- Create: `supabase/migrations/0080_submit_pairs.sql`
- Modify: `src/lib/types.ts` (Activity, around line 303 after `proxy_fields`; ActivitySubmission, after `approved_by_verifier`)

**Interfaces:**
- Produces:
  - SQL `submit_answers(p_activity_id, p_attendee_id, p_answers, p_today, p_submitted_by default null, p_file_hashes default '{}', p_pair_id uuid default null) returns text`
  - SQL `submit_answers_pair(p_activity_id uuid, p_attendee_id uuid, p_partner_id uuid, p_answers jsonb, p_today date, p_submitted_by uuid, p_file_hashes jsonb) returns table(code text, who text)`
  - Types: `Activity.allow_pair?: boolean`, `ActivitySubmission.pair_id?: string | null`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0080_submit_pairs.sql`. The `submit_answers` body is 0064's, unchanged, plus `p_pair_id` (signature and insert):

```sql
-- Submit together with someone from another team (spec 2026-10-14-submit-with-partner-design.md,
-- D524-D535). Two rows per tagged submit, one per person, sharing pair_id and one set of files.

-- D524: per activity, off by default.
alter table public.activities add column if not exists allow_pair boolean not null default false;
-- D525: the two rows of one tagged submit; null on every other row.
alter table public.activity_submissions add column if not exists pair_id uuid;
create index if not exists activity_submissions_pair_idx on public.activity_submissions (pair_id) where pair_id is not null;

-- As 0064, plus p_pair_id stamped on the row. A new signature, so the old one is dropped rather
-- than overloaded; every default keeps the existing 6-argument call working.
drop function submit_answers(uuid, uuid, jsonb, date, uuid, jsonb);

create function submit_answers(
  p_activity_id uuid,
  p_attendee_id uuid,
  p_answers jsonb,
  p_today date,
  p_submitted_by uuid default null,
  p_file_hashes jsonb default '{}'::jsonb,
  p_pair_id uuid default null
) returns text
language plpgsql
as $$
declare
  a activities%rowtype;
  att attendees%rowtype;
  v_proxy attendees%rowtype;
  used int;
  v_constraint text;
begin
  select * into a from activities where id = p_activity_id for update;
  if not found then return 'missing'; end if;
  if a.kind <> 'submission' then return 'missing'; end if;

  select * into att from attendees where id = p_attendee_id;
  if not found or att.event_id <> a.event_id then return 'missing'; end if;

  if not a.is_open then return 'closed'; end if;

  if a.scoring is not null and (
    p_today < (a.scoring->>'starts_on')::date or p_today > (a.scoring->>'ends_on')::date
  ) then
    return 'closed';
  end if;

  -- D392: the sender must share the member's group and hold a Yes in one of the proxy fields.
  if p_submitted_by is not null and p_submitted_by <> p_attendee_id then
    select * into v_proxy from attendees where id = p_submitted_by;
    if not found or v_proxy.event_id <> a.event_id or v_proxy.group_id is null
       or v_proxy.group_id is distinct from att.group_id
       or not exists (
         select 1 from unnest(a.proxy_fields) as f(k)
          where lower(btrim(coalesce(v_proxy.extra->>f.k, ''))) in ('yes', 'y', 'true')
       ) then
      return 'proxy';
    end if;
  end if;

  if not category_matches(a.categories, att.category) then return 'ineligible'; end if;

  -- D396: the same file already in one of this person's live entries to this activity.
  if exists (
    select 1 from activity_submissions s, jsonb_each_text(s.file_hashes) as h(k, v)
     where s.activity_id = a.id and s.attendee_id = p_attendee_id and s.status = 'submitted'
       and h.v in (select value from jsonb_each_text(coalesce(p_file_hashes, '{}'::jsonb)))
  ) then
    return 'duplicate';
  end if;

  if a.group_mode <> 'off' then
    if att.group_id is null then return 'nogroup'; end if;
    if a.group_mode = 'entries' then
      select count(*) into used from activity_submissions
       where activity_id = a.id and group_id = att.group_id and status = 'submitted';
      if used >= a.group_target then return 'groupdone'; end if;
    elsif a.group_mode = 'everyone' and exists (
      select 1 from activity_submissions
       where activity_id = a.id and attendee_id = p_attendee_id
         and group_id = att.group_id and status = 'submitted'
    ) then
      return 'limit';
    end if;
    -- 'members': no limit at all - one entry per workout (D368).
  else
    if a.max_per_attendee is not null then
      select count(*) into used from activity_submissions
       where activity_id = a.id and attendee_id = p_attendee_id and status = 'submitted';
      if used >= a.max_per_attendee then return 'limit'; end if;
    end if;

    if a.per_day and exists (
      select 1 from activity_submissions
       where activity_id = a.id and attendee_id = p_attendee_id and submitted_on = p_today and status = 'submitted'
    ) then
      return 'today';
    end if;
  end if;

  insert into activity_submissions (event_id, activity_id, attendee_id, group_id, answers, submitted_on, per_day, submitted_by, file_hashes, pair_id)
  values (
    a.event_id, a.id, p_attendee_id,
    case when a.group_mode <> 'off' then att.group_id end,
    coalesce(p_answers, '{}'::jsonb), p_today, a.per_day,
    case when p_submitted_by is distinct from p_attendee_id then p_submitted_by end,
    coalesce(p_file_hashes, '{}'::jsonb),
    p_pair_id
  );

  return 'ok';
exception
  -- Scoped to that one constraint BY NAME, as in 0053: anything else is a genuine fault.
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'activity_submissions_one_a_day' then
      return 'today';
    end if;
    raise;
end;
$$;

revoke execute on function submit_answers(uuid, uuid, jsonb, date, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function submit_answers(uuid, uuid, jsonb, date, uuid, jsonb, uuid) to service_role;

-- D526/D527: the tagged submit, all or nothing. The pair rules first, then submit_answers for
-- the member and for the partner with one shared pair_id. A partner refusal raises inside the
-- sub-block, which rolls the member's insert back, and is caught here to return its code.
-- `who` says whose refusal it is, so the message can name the partner.
create function submit_answers_pair(
  p_activity_id uuid,
  p_attendee_id uuid,
  p_partner_id uuid,
  p_answers jsonb,
  p_today date,
  p_submitted_by uuid,
  p_file_hashes jsonb
) returns table (code text, who text)
language plpgsql
as $$
declare
  a activities%rowtype;
  m attendees%rowtype;
  p attendees%rowtype;
  v_pair uuid := gen_random_uuid();
  c text;
begin
  select * into a from activities where id = p_activity_id;
  if not found or a.kind <> 'submission' then return query select 'missing'::text, 'self'::text; return; end if;
  if not a.allow_pair then return query select 'pairoff'::text, 'partner'::text; return; end if;

  select * into m from attendees where id = p_attendee_id;
  if not found or m.event_id <> a.event_id then return query select 'missing'::text, 'self'::text; return; end if;
  select * into p from attendees where id = p_partner_id;
  if not found or p.event_id <> a.event_id then return query select 'missing'::text, 'partner'::text; return; end if;

  if p.id = m.id then return query select 'pairself'::text, 'partner'::text; return; end if;
  if m.group_id is null then return query select 'pairnoteam_self'::text, 'self'::text; return; end if;
  if p.group_id is null then return query select 'pairnoteam'::text, 'partner'::text; return; end if;
  if p.group_id = m.group_id then return query select 'pairsame'::text, 'partner'::text; return; end if;

  begin
    c := submit_answers(p_activity_id, p_attendee_id, p_answers, p_today, p_submitted_by, p_file_hashes, v_pair);
    if c <> 'ok' then return query select c, 'self'::text; return; end if;
    c := submit_answers(p_activity_id, p_partner_id, p_answers, p_today, null, p_file_hashes, v_pair);
    if c <> 'ok' then raise exception using errcode = 'P0001', message = c; end if;
  exception when raise_exception then
    return query select sqlerrm::text, 'partner'::text;
    return;
  end;

  return query select 'ok'::text, 'self'::text;
end;
$$;

revoke execute on function submit_answers_pair(uuid, uuid, uuid, jsonb, date, uuid, jsonb) from public, anon, authenticated;
grant execute on function submit_answers_pair(uuid, uuid, uuid, jsonb, date, uuid, jsonb) to service_role;
```

- [ ] **Step 2: Apply and verify the functions**

Apply with `apply_migration` (name `submit_pairs`, project `wfmqwwcolfigjylkgrsv`). Then verify:

```sql
select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname in ('submit_answers','submit_answers_pair');
select column_name, is_nullable, column_default from information_schema.columns
 where (table_name='activities' and column_name='allow_pair') or (table_name='activity_submissions' and column_name='pair_id');
```

Expected:
- Exactly one `submit_answers`, with 7 arguments, and one `submit_answers_pair`.
- `allow_pair` is not nullable, default `false`.
- `pair_id` is nullable.

- [ ] **Step 3: SQL behaviour check on ecpkom (throwaway data)**

Run with `execute_sql`. It creates a throwaway activity and team, checks the cases, and cleans up:

```sql
with ev as (select id, org_id from events where slug='ecpkom'),
act as (insert into activities (org_id, event_id, name, kind, is_open, allow_pair, group_mode, questions)
        select org_id, id, 'ZZ Pair SQL test', 'submission', true, true, 'members', '[]'::jsonb from ev returning id),
grp as (insert into event_groups (org_id, event_id, name) select org_id, id, 'ZZ Pair Team B' from ev returning id)
update attendees set group_id = (select id from grp)
 where token = 'u9ws4ftatd4b' and event_id = (select id from ev)
returning (select id from act) as act_id, (select id from grp) as grp_b;
```

Then, with `<act>` set to the returned id:
- `CS` = attendee with token `beknxtsrdtgr` (Team 1)
- `TWJ` = `3cajh2vpkrqz` (Team 1)
- `ZZ` = `u9ws4ftatd4b` (now ZZ Pair Team B)

```sql
-- a) other team: ok, two rows, one pair_id
select * from submit_answers_pair('<act>', (select id from attendees where token='beknxtsrdtgr'), (select id from attendees where token='u9ws4ftatd4b'), '{}'::jsonb, '2026-10-14', null, '{}'::jsonb);
select attendee_id, group_id, pair_id from activity_submissions where activity_id='<act>';
-- b) same team: pairsame, no new rows
select * from submit_answers_pair('<act>', (select id from attendees where token='beknxtsrdtgr'), (select id from attendees where token='3cajh2vpkrqz'), '{}'::jsonb, '2026-10-14', null, '{}'::jsonb);
-- c) partner refused AFTER member passes: close nothing, but make it per_day-style via max_per_attendee on group_mode off
update activities set group_mode='off', max_per_attendee=1 where id='<act>';
select * from submit_answers_pair('<act>', (select id from attendees where token='3cajh2vpkrqz'), (select id from attendees where token='u9ws4ftatd4b'), '{}'::jsonb, '2026-10-14', null, '{}'::jsonb);
select count(*) from activity_submissions where activity_id='<act>';
```

Expected:
- **a)** returns `ok | self`; two rows with different `group_id`s and the same non-null `pair_id`.
- **b)** returns `pairsame | partner`; still 2 rows.
- **c)** returns `limit | partner`, because ZZ already has 1 entry. The count stays **2**: Wei Jie's row was rolled back.

Clean up:

```sql
delete from activity_submissions where activity_id='<act>';
delete from activities where id='<act>';
update attendees set group_id = null where token='u9ws4ftatd4b' and group_id='<grp_b>';
delete from event_groups where id='<grp_b>';
```

- [ ] **Step 4: Types**

In `src/lib/types.ts`, in `Activity` directly after `proxy_fields: string[];`:

```ts
  /** D524: people may tag one person from another team, and both get the entry. Optional so old fixtures compile. */
  allow_pair?: boolean;
```

In `ActivitySubmission` after `approved_by_verifier?: string | null;`:

```ts
  /** D525: shared by the two rows of one tagged submit; null otherwise. Optional so old fixtures compile. */
  pair_id?: string | null;
```

- [ ] **Step 5: Type-check, test, commit**

Run `npx tsc --noEmit` (expected: clean) and `npm test` (expected: all pass). Then:

```bash
git add supabase/migrations/0080_submit_pairs.sql src/lib/types.ts
git commit -m "feat(activities): pair columns and submit_answers_pair, all or nothing (D524-D527)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The pure rules

**Files:**
- Create: `src/features/activities/lib/pairs.ts`
- Test: `tests/activities/pairs.test.ts`
- Modify: `docs/superpowers/specs/2026-10-14-submit-with-partner-design.md` (the D530 ruling)

**Interfaces:**
- Consumes: `SubmitCode` from `../db/activities` (type only), `categoryMatches` from `@/lib/agenda`.
- Produces:
  - `type PairWho = "self" | "partner"`
  - `type PairCode = SubmitCode | "pairoff" | "pairself" | "pairsame" | "pairnoteam" | "pairnoteam_self"`
  - `type PairTeam = { id: string; name: string; people: { id: string; name: string }[] }`
  - `pairCandidates(groups: {id,name}[], attendees: {id,name,group_id,category}[], myGroupId: string | null, categories: string[] | null): PairTeam[]`
  - `pairRefusal(code: PairCode, who: PairWho, partner: string): string | null`
  - `withText(partnerName: string | null | undefined): string | null`

- [ ] **Step 1: Failing tests**

Create `tests/activities/pairs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pairCandidates, pairRefusal, withText } from "@/features/activities/lib/pairs";

const groups = [{ id: "g1", name: "Team 1" }, { id: "g2", name: "Team 2" }, { id: "g3", name: "Team 3" }];
const people = [
  { id: "a", name: "Aisyah", group_id: "g1", category: "Wellness" },
  { id: "b", name: "Ben", group_id: "g2", category: "Wellness" },
  { id: "c", name: "Chen", group_id: "g2", category: "Crew" },
  { id: "d", name: "Dina", group_id: "g3", category: "Wellness" },
  { id: "e", name: "Ah Beng", group_id: "g2", category: "Wellness" },
  { id: "f", name: "Faiz", group_id: null, category: "Wellness" },
];

describe("pairCandidates (D526, D530)", () => {
  it("lists every other team's eligible people, by team, names sorted", () => {
    expect(pairCandidates(groups, people, "g1", ["Wellness"])).toEqual([
      { id: "g2", name: "Team 2", people: [{ id: "e", name: "Ah Beng" }, { id: "b", name: "Ben" }] },
      { id: "g3", name: "Team 3", people: [{ id: "d", name: "Dina" }] },
    ]);
  });

  it("leaves out the submitter's own team, people in no team, and empty teams", () => {
    const teams = pairCandidates(groups, people, "g2", ["Wellness"]);
    expect(teams.map((t) => t.id)).toEqual(["g1", "g3"]);
    expect(teams.flatMap((t) => t.people.map((p) => p.id))).not.toContain("f");
  });

  it("lists everyone in other teams when the activity is open to every category", () => {
    expect(pairCandidates(groups, people, "g1", null).find((t) => t.id === "g2")?.people.map((p) => p.id)).toEqual(["e", "b", "c"]);
  });

  it("offers nobody to someone who is not in a team", () => {
    expect(pairCandidates(groups, people, null, null)).toEqual([]);
  });
});

describe("pairRefusal (D529)", () => {
  it("names the partner for every partner-side refusal", () => {
    expect(pairRefusal("pairsame", "partner", "Wei Jie")).toBe("Wei Jie is on your team. Tag someone from another team.");
    expect(pairRefusal("pairnoteam", "partner", "Wei Jie")).toBe("Wei Jie isn't in a team yet.");
    expect(pairRefusal("nogroup", "partner", "Wei Jie")).toBe("Wei Jie isn't in a team yet.");
    expect(pairRefusal("ineligible", "partner", "Wei Jie")).toBe("Wei Jie can't take part in this activity.");
    expect(pairRefusal("today", "partner", "Wei Jie")).toBe("Wei Jie already has an entry today.");
    expect(pairRefusal("limit", "partner", "Wei Jie")).toBe("Wei Jie has reached the limit for this activity.");
    expect(pairRefusal("groupdone", "partner", "Wei Jie")).toBe("Wei Jie has reached the limit for this activity.");
    expect(pairRefusal("duplicate", "partner", "Wei Jie")).toBe("Wei Jie already sent this photo in another entry.");
  });

  it("says the submitter needs a team, and covers the rare cases", () => {
    expect(pairRefusal("pairnoteam_self", "self", "Wei Jie")).toBe("You need to be in a team to tag someone.");
    expect(pairRefusal("pairself", "partner", "Wei Jie")).toBe("Pick someone other than the person this entry is for.");
    expect(pairRefusal("pairoff", "partner", "Wei Jie")).toBe("Tagging someone isn't on for this activity.");
    expect(pairRefusal("missing", "partner", "Wei Jie")).toBe("Couldn't add Wei Jie. Try again.");
  });

  it("leaves the member's own refusals, and ok, to the usual messages", () => {
    expect(pairRefusal("today", "self", "Wei Jie")).toBeNull();
    expect(pairRefusal("ok", "self", "Wei Jie")).toBeNull();
  });
});

describe("withText (D531)", () => {
  it("names the partner", () => expect(withText("Wei Jie")).toBe("With Wei Jie"));
  it("says nothing when the partner's entry is gone", () => {
    expect(withText(null)).toBeNull();
    expect(withText(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run `npx vitest run tests/activities/pairs.test.ts`. Expected: FAIL, because the module `@/features/activities/lib/pairs` can't be resolved.

- [ ] **Step 3: Implement**

Create `src/features/activities/lib/pairs.ts`:

```ts
import { categoryMatches } from "@/lib/agenda";
import type { SubmitCode } from "../db/activities";

/**
 * Submit together with someone from another team (spec 2026-10-14, D524-D535). Pure and
 * client-safe: who may be tagged, what a refusal says, and the "With …" line every surface shows.
 */

/** Whose refusal `submit_answers_pair` returned: the member's own, or the tagged partner's. */
export type PairWho = "self" | "partner";
/** `submit_answers`' codes, plus the pair rules `submit_answers_pair` checks first (D526). */
export type PairCode = SubmitCode | "pairoff" | "pairself" | "pairsame" | "pairnoteam" | "pairnoteam_self";

export type PairTeam = { id: string; name: string; people: { id: string; name: string }[] };

/**
 * D526/D530: who the picker offers - every other team's members who may enter this activity, by
 * team, names sorted. A proxy only ever submits for their own group (D392), so "the member's team"
 * is always `myGroupId`. Nobody is offered to someone in no team: the pair needs two teams.
 */
export function pairCandidates(
  groups: { id: string; name: string }[],
  attendees: { id: string; name: string; group_id: string | null; category: string | null }[],
  myGroupId: string | null,
  categories: string[] | null,
): PairTeam[] {
  if (!myGroupId) return [];
  return groups
    .filter((g) => g.id !== myGroupId)
    .map((g) => ({
      id: g.id,
      name: g.name,
      people: attendees
        .filter((a) => a.group_id === g.id && categoryMatches(categories, a.category))
        .map((a) => ({ id: a.id, name: a.name }))
        .sort((x, y) => x.name.localeCompare(y.name)),
    }))
    .filter((t) => t.people.length > 0);
}

/**
 * D529: what a refused tagged submit says. Null for `ok` and for the member's own refusals, which
 * keep the submit action's usual wording; everything about the partner names them.
 */
export function pairRefusal(code: PairCode, who: PairWho, partner: string): string | null {
  if (code === "ok") return null;
  if (code === "pairnoteam_self") return "You need to be in a team to tag someone.";
  if (who === "self") return null;
  switch (code) {
    case "pairsame": return `${partner} is on your team. Tag someone from another team.`;
    case "pairnoteam":
    case "nogroup": return `${partner} isn't in a team yet.`;
    case "ineligible": return `${partner} can't take part in this activity.`;
    case "today": return `${partner} already has an entry today.`;
    case "limit":
    case "groupdone": return `${partner} has reached the limit for this activity.`;
    case "duplicate": return `${partner} already sent this photo in another entry.`;
    case "pairself": return "Pick someone other than the person this entry is for.";
    case "pairoff": return "Tagging someone isn't on for this activity.";
    default: return `Couldn't add ${partner}. Try again.`;
  }
}

/** D531: the line under a paired entry; nothing once the partner's entry is gone. */
export function withText(partnerName: string | null | undefined): string | null {
  return partnerName ? `With ${partnerName}` : null;
}
```

`categoryMatches(categories: string[] | null, category: string | null)` (`src/lib/agenda.ts:31`) is the TS mirror of SQL `category_matches`. Null or empty categories mean open to all.

- [ ] **Step 4: Run, expect PASS**

Run `npx vitest run tests/activities/pairs.test.ts`. Expected: all pass.

- [ ] **Step 5: Record the D530 ruling in the spec**

In the spec's D530 bullet, replace the sentence ending "…so the member's own team drops out. That makes it a small client component: it gets every team's candidates and hides the member's team." with:

```
  - Every team but the submitter's is listed. A proxy only ever submits for their own group
    (D392), so the member's team is always the submitter's: a plain server-rendered select.
```

- [ ] **Step 6: Commit**

```bash
git add src/features/activities/lib/pairs.ts tests/activities/pairs.test.ts docs/superpowers/specs/2026-10-14-submit-with-partner-design.md
git commit -m "feat(activities): who can be tagged, refusal wording and the With line (D526, D529-D531)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Database layer — pair submit, linked writes, partners, shared files

**Files:**
- Modify: `src/features/activities/db/activities.ts`: `NewActivity` (add `allow_pair?`), `submitAnswers` neighbourhood, `updateSubmissionAnswers`, `updateOwnSubmissionAnswers`, `deleteOwnSubmission`, `approveSubmission`, `unapproveSubmission`, `revokeSubmission`.
- Modify: `src/lib/db/attendees.ts`: `deleteAttendees`.

**Interfaces:**
- Consumes: `PairCode`, `PairWho` (Task 2).
- Produces:
  - `submitAnswersPair(activityId, attendeeId, partnerId, answers, today, submittedBy: string | null, fileHashes): Promise<{ code: PairCode; who: PairWho }>`
  - `pairPartnerIds(rows: Pick<ActivitySubmission, "id" | "pair_id">[]): Promise<Map<string, string>>`: row id → the partner row's `attendee_id`.
  - Every existing write's signature is **unchanged**; each now acts on both rows of a pair.

- [ ] **Step 1: `NewActivity`**

After `health_data?: boolean;` in `NewActivity`:

```ts
  /** Submission kind only (D524). Left out, the column's false stands. */
  allow_pair?: boolean;
```

- [ ] **Step 2: The scope helper and the pair submit**

Add the import `import type { PairCode, PairWho } from "../lib/pairs";` at the top of `db/activities.ts`. Then add before `UNAPPROVED`:

```ts
/**
 * D532/D533: what a write to one entry acts on - both rows of a tagged pair, or just this row.
 * Read fresh per write rather than trusted from the caller's copy of the row.
 */
async function linkedScope(id: string): Promise<{ col: "id" | "pair_id"; val: string }> {
  const { data, error } = await serviceClient().from("activity_submissions").select("pair_id").eq("id", id).maybeSingle();
  if (error) throw error;
  const pair = (data as { pair_id: string | null } | null)?.pair_id ?? null;
  return pair ? { col: "pair_id", val: pair } : { col: "id", val: id };
}

/** D531: for each paired row given, the other row's attendee. One query for the whole list. */
export async function pairPartnerIds(rows: Pick<ActivitySubmission, "id" | "pair_id">[]): Promise<Map<string, string>> {
  const pairs = [...new Set(rows.flatMap((r) => (r.pair_id ? [r.pair_id] : [])))];
  if (pairs.length === 0) return new Map();
  const { data, error } = await serviceClient().from("activity_submissions").select("id, pair_id, attendee_id").in("pair_id", pairs);
  if (error) throw error;
  const all = (data ?? []) as { id: string; pair_id: string; attendee_id: string }[];
  const out = new Map<string, string>();
  for (const r of rows) {
    const other = r.pair_id ? all.find((x) => x.pair_id === r.pair_id && x.id !== r.id) : undefined;
    if (other) out.set(r.id, other.attendee_id);
  }
  return out;
}
```

After `submitAnswers`, add:

```ts
/**
 * D527: the tagged submit - both people's entries or neither, decided in one transaction by
 * `submit_answers_pair`. `who` says whose refusal it is, so the message can name the partner.
 */
export async function submitAnswersPair(
  activityId: string, attendeeId: string, partnerId: string, answers: Record<string, string>, today: string,
  submittedBy: string | null, fileHashes: Record<string, string>,
): Promise<{ code: PairCode; who: PairWho }> {
  const { data, error } = await serviceClient().rpc("submit_answers_pair", {
    p_activity_id: activityId, p_attendee_id: attendeeId, p_partner_id: partnerId, p_answers: answers, p_today: today,
    p_submitted_by: submittedBy, p_file_hashes: fileHashes,
  });
  if (error) throw error;
  const row = (data as { code: PairCode; who: PairWho }[] | null)?.[0];
  return row ?? { code: "missing", who: "self" };
}
```

- [ ] **Step 3: Linked writes**

Change each body as follows. The signatures stay the same.

`updateSubmissionAnswers` (admin edit):

```ts
  const s = await linkedScope(id);
  const { data, error } = await serviceClient().from("activity_submissions")
    .update({ answers, file_hashes: fileHashes, edited_at: new Date().toISOString(), edited_by: userId, ...UNAPPROVED })
    .eq(s.col, s.val).eq("activity_id", activityId).eq("status", "submitted").select("id");
```

`updateOwnSubmissionAnswers`:
- A pair is written as a whole. Who may edit was checked by `canEditOwn` on a fresh read, and the owner never changes.
- So the owner `or` guard stays only for an unpaired row. Status and day are still guarded in the write.

```ts
  const s = await linkedScope(id);
  let q = serviceClient().from("activity_submissions")
    .update({ answers, file_hashes: fileHashes, attendee_edited_at: new Date().toISOString(), ...UNAPPROVED })
    .eq(s.col, s.val).eq("activity_id", activityId);
  if (s.col === "id") q = q.or(`attendee_id.eq.${attendeeId},submitted_by.eq.${attendeeId}`);
  const { data, error } = await q.eq("status", "submitted").eq("submitted_on", today).select("id");
```

`deleteOwnSubmission` deletes both rows of a pair. It returns the first removed row: both name the same files, so the caller deletes them once.

```ts
  const s = await linkedScope(id);
  let q = serviceClient().from("activity_submissions").delete().eq(s.col, s.val).eq("activity_id", activityId);
  if (s.col === "id") q = q.or(`attendee_id.eq.${attendeeId},submitted_by.eq.${attendeeId}`);
  const { data, error } = await q.eq("status", "submitted").eq("submitted_on", today).select("*");
```

In `approveSubmission`, `unapproveSubmission` and `revokeSubmission`, replace `.eq("id", id)` with `.eq(s.col, s.val)` after `const s = await linkedScope(id);`. Keep every other filter as it is.

Update each doc comment with one line naming D532 or D533.

- [ ] **Step 4: `deleteAttendees` keeps a surviving partner's files (D534)**

Replace the read-and-delete-files part of the loop in `src/lib/db/attendees.ts`:

```ts
    const { data: subs, error: readError } = await db.from("activity_submissions")
      .select("answers, pair_id").eq("event_id", event.id).in("attendee_id", chunk);
    if (readError) throw readError;
    const rows = (subs ?? []) as { answers: Record<string, unknown> | null; pair_id: string | null }[];
    // D534: a tagged pair shares one set of files. The partner's row survives this delete
    // (unless the partner is in this chunk too), so the paths it still names are kept.
    const pairs = [...new Set(rows.flatMap((r) => (r.pair_id ? [r.pair_id] : [])))];
    let kept = new Set<string>();
    if (pairs.length > 0) {
      const { data: partners, error: pairError } = await db.from("activity_submissions")
        .select("answers").in("pair_id", pairs).not("attendee_id", "in", `(${chunk.join(",")})`);
      if (pairError) throw pairError;
      kept = new Set(submissionFilePaths(((partners ?? []) as { answers: Record<string, unknown> | null }[]).map((r) => r.answers ?? {}), `${event.org_id}/${event.id}`));
    }
    const paths = submissionFilePaths(rows.map((r) => r.answers ?? {}), `${event.org_id}/${event.id}`).filter((p) => !kept.has(p));
    await deleteSubmissionFiles(paths);
```

`submissionFilePaths(answers, prefix): string[]` is in `src/lib/storage.ts:265`.

- [ ] **Step 5: Type-check, test, commit**

Run `npx tsc --noEmit` and `npm test`. Expected: clean, all pass.

```bash
git add src/features/activities/db/activities.ts src/lib/db/attendees.ts
git commit -m "feat(activities): pair submit, linked edit/delete/revoke/approve, shared files kept (D527, D532-D534)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Admin setting

**Files:**
- Modify: `src/features/activities/kinds/submission/settings.ts`
- Modify: `src/features/activities/admin/ActivityRows.tsx`, after the proxy `fieldset` (around line 84)
- Test: `tests/activities/settings.test.ts`

**Interfaces:**
- Produces: `readSubmissionSettings(...)` returns `allow_pair: boolean`.

- [ ] **Step 1: Failing test**

In `tests/activities/settings.test.ts`, in `describe("submission")`:

1. In "reads a bare form with every rule off", change the line `attendee_edit: false, health_data: false, proxy_fields: [], questions: [],` to:

```ts
          attendee_edit: false, health_data: false, proxy_fields: [], allow_pair: false, questions: [],
```

2. Add after that test:

```ts
    it("reads the tag-someone-from-another-team switch (D524)", () => {
      expect(readSettings("submission", form({ name: "Active", allow_pair: "on" }))).toMatchObject({ ok: true, settings: { allow_pair: true } });
    });
```

- [ ] **Step 2: Run, expect FAIL**

Run `npx vitest run tests/activities/settings.test.ts`. Expected: FAIL, because `allow_pair` is missing.

- [ ] **Step 3: Implement**

In `settings.ts`:
- add `"allow_pair"` to the `Pick<NewActivity, …>` list;
- in the returned object after `health_data`, add:

```ts
    // D524: tag one person from another team; both get the entry.
    allow_pair: form.checked("allow_pair"),
```

In `ActivityRows.tsx`, after the proxy `{fields.length > 0 && (...)}` block, add:

```tsx
      {/* D524 */}
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="allow_pair" defaultChecked={activity?.allow_pair ?? false} className="size-4" />
          Let people tag someone from another team
        </label>
        <p className="pl-6 text-xs text-muted-foreground">
          One entry for an activity done together: both people get it, each for their own team. Editing, deleting or revoking one changes both.
        </p>
      </div>
```

- [ ] **Step 4: Run, expect PASS; full suite**

Run `npx vitest run tests/activities/settings.test.ts`, then `npm test` and `npx tsc --noEmit`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/activities/kinds/submission/settings.ts src/features/activities/admin/ActivityRows.tsx tests/activities/settings.test.ts
git commit -m "feat(activities): admin switch to allow tagging someone from another team (D524)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Portal — the picker and the tagged submit

**Files:**
- Create: `src/features/activities/kinds/submission/PairPicker.tsx`
- Modify: `src/features/activities/kinds/submission/SubmissionBody.tsx` (`SubmitForm`, plus a new `PairAsk`)
- Modify: `src/features/activities/portal/actions.ts` (`submitAnswersAction`, `editMySubmissionAction`)

**Interfaces:**
- Consumes:
  - `pairCandidates`, `pairRefusal`, `PairTeam` (Task 2)
  - `submitAnswersPair`, `pairPartnerIds` (Task 3)
  - `listGroups` (`@/lib/db/groups`), `listAttendees` (`@/lib/db/attendees`)
- Produces: the `:with` form field (an attendee id, or empty).

- [ ] **Step 1: The picker**

Create `src/features/activities/kinds/submission/PairPicker.tsx`:

```tsx
import type { PairTeam } from "../../lib/pairs";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

const inputClass = "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * D530: tag one person from another team, by team. "No one" first, so leaving it alone is an
 * ordinary entry. Posted as `:with` - a colon, so no question key can collide with it.
 */
export function PairPicker({ teams }: { teams: PairTeam[] }) {
  return (
    <Field>
      <FieldLabel htmlFor="submit-with">Did this with someone from another team?</FieldLabel>
      <select id="submit-with" name=":with" defaultValue="" className={inputClass}>
        <option value="">No one</option>
        {teams.map((t) => (
          <optgroup key={t.id} label={t.name}>
            {t.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </optgroup>
        ))}
      </select>
      <FieldDescription>They get this entry too, for their team.</FieldDescription>
    </Field>
  );
}
```

- [ ] **Step 2: Render it in `SubmitForm`**

In `SubmissionBody.tsx`:
- add the imports `import { PairPicker } from "./PairPicker";`, `import { pairCandidates } from "../../lib/pairs";`, `import { listGroups } from "@/lib/db/groups";` (merge into the existing `@/lib/db/groups` import) and `import { listAttendees } from "@/lib/db/attendees";` (merge into the existing import);
- add, beside `HealthConsentAsk`:

```tsx
/**
 * D530: the "with someone from another team" picker, when the activity allows it. Reads for
 * itself (the attendee is memoised per request), as HealthConsentAsk does, so neither caller of
 * SubmitForm has to load candidates it may never show.
 */
async function PairAsk({ f, slug, token }: { f: Activity; slug: string; token: string }) {
  if (!f.allow_pair) return null;
  const { attendee } = await loadPortalAttendee(slug, token);
  if (!attendee.group_id) return null;
  const [groups, attendees] = await Promise.all([listGroups(f.event_id), listAttendees(f.event_id)]);
  const teams = pairCandidates(groups, attendees, attendee.group_id, f.categories);
  return teams.length > 0 ? <PairPicker teams={teams} /> : null;
}
```

In `SubmitForm`, insert `<PairAsk f={f} slug={slug} token={token} />` directly after the `SubmitFor` line.

- [ ] **Step 3: The submit action**

In `portal/actions.ts`:
- add the imports `import { submitAnswersPair } from "../db/activities";` (merge into the existing import from `../db/activities`) and `import { pairRefusal } from "../lib/pairs";`;
- in `submitAnswersAction`, after the D412 health block and before `readAnswers`, add:

```ts
  // D526-D528: `:with` tags one person from another team. Only checked to be in this event here;
  // `submit_answers_pair` decides the pair rules. Their health consent must already be on file -
  // nobody consents for someone else (D412).
  const withId = String(fd.get(":with") ?? "");
  const partner = withId && activity.allow_pair ? await getAttendee(withId) : null;
  if (withId && activity.allow_pair && (!partner || partner.event_id !== event.id)) {
    redirect(flashPath(path, "That person isn't in this event.", "error"));
  }
  if (partner && activity.health_data && !(await hasHealthConsent(partner.id, activity.id))) {
    redirect(flashPath(path, `${partner.name} needs to agree to the health-information consent on their own page first.`, "error"));
  }
```

Replace the `const result = …` through the final `redirect(…)` with:

```ts
  const today = nowInKL().date;
  if (partner) {
    const { code, who } = await saveOrDiscard(form.uploaded, () =>
      submitAnswersPair(activity.id, member.id, partner.id, form.answers, today, onBehalf ? attendee.id : null, form.hashes));
    if (code !== "ok") await discardUploads(form.uploaded);
    const refused = pairRefusal(code, who, partner.name);
    const message = code === "ok"
      ? `Submitted${onBehalf ? ` for ${member.name}` : ""} with ${partner.name}. Thanks!`
      : refused ?? SUBMIT_RESULT_MESSAGES[code as SubmitCode] ?? SUBMIT_RESULT_MESSAGES.missing;
    redirect(flashPath(path, message, code === "ok" ? "ok" : "error"));
  }
  const result = await saveOrDiscard(form.uploaded, () => submitAnswers(activity.id, member.id, form.answers, today, onBehalf ? attendee.id : null, form.hashes));
  if (result !== "ok") await discardUploads(form.uploaded);
  const message = result === "ok" && onBehalf ? `Submitted for ${member.name}. Thanks!` : SUBMIT_RESULT_MESSAGES[result];
  redirect(flashPath(path, message, result === "ok" ? "ok" : "error"));
```

`saveOrDiscard<T>` is already generic (`lib/submission-uploads.ts:107`). Delete the original `const today = nowInKL().date;` line above it, so it isn't declared twice.

- [ ] **Step 4: Pair-aware duplicate check on edit (D532)**

In `editMySubmissionAction`, replace the `sharesFile(...)` condition with a check over both owners' entries, excluding the pair's own rows:

```ts
  // D396/D532: a swapped-in photo may not be one already in another live entry of either owner.
  // The pair's own rows are the entry being edited, so they never count against it.
  const partnerId = current.pair_id ? (await pairPartnerIds([current])).get(current.id) : undefined;
  const owners = [current.attendee_id, ...(partnerId ? [partnerId] : [])];
  const others = (await Promise.all(owners.map((o) => entriesForAttendee(activity.id, o)))).flat()
    .filter((e) => e.id !== current.id && (!current.pair_id || e.pair_id !== current.pair_id));
  if (Object.keys(form.hashes).length > 0 && sharesFile(form.hashes, others)) {
    await discardUploads(form.uploaded);
    redirect(flashPath(path, DUPLICATE, "error"));
  }
```

Add `pairPartnerIds` to the `../db/activities` import.

- [ ] **Step 5: Type-check, lint, test, commit**

Run `npx tsc --noEmit`, `npm run lint` and `npm test`. Expected: clean.

```bash
git add src/features/activities/kinds/submission/PairPicker.tsx src/features/activities/kinds/submission/SubmissionBody.tsx src/features/activities/portal/actions.ts
git commit -m "feat(portal): tag someone from another team on a submission (D526-D530, D532)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 6: "With …" everywhere

**Files:**
- Modify: `src/features/activities/kinds/submission/SubmissionBody.tsx` (`addedByLine`)
- Modify: `src/features/activities/kinds/submission/SubmissionHistory.tsx:49`, `src/features/activities/kinds/submission/scoring/tracker/EntryTimeline.tsx:45`
- Modify: `src/features/activities/kinds/submission/SubmissionDetail.tsx`, `SubmissionTable.tsx`
- Modify: `src/features/activities/verify/VerifyPage.tsx`, `VerifyCard.tsx`

**Interfaces:**
- Consumes: `withText` (Task 2), `pairPartnerIds` (Task 3).

- [ ] **Step 1: Attendee history and tracker**

Replace `addedByLine` in `SubmissionBody.tsx`:

```ts
/**
 * D392: "Added by <name>" for entries a group member sent for this attendee. D531: "With <name>"
 * for a tagged pair. One read for each, and only when there are any.
 */
export async function addedByLine(eventId: string, entries: Pick<ActivitySubmission, "id" | "submitted_by" | "pair_id">[]) {
  const partners = await pairPartnerIds(entries);
  const ids = [...new Set([...entries.flatMap((s) => (s.submitted_by ? [s.submitted_by] : [])), ...partners.values()])];
  const names = new Map(ids.length ? (await listAttendeesByIds(eventId, ids)).map((a) => [a.id, a.name]) : []);
  return (s: ActivitySubmission) => {
    const added = s.submitted_by ? `Added by ${names.get(s.submitted_by) ?? "a group member"}` : null;
    const partner = partners.get(s.id);
    const together = withText(partner ? names.get(partner) : null);
    return [added, together].filter(Boolean).join(" · ") || null;
  };
}
```

Add `pairPartnerIds` to the `../../db/activities` import and `import { withText } from "../../lib/pairs";`.

In `SubmissionHistory.tsx:49` and `EntryTimeline.tsx:45`, change:

```ts
const added = s.submitted_by ? addedBy?.(s) : null;
```

to:

```ts
const added = addedBy?.(s) ?? null;
```

- [ ] **Step 2: Admin table**

In `SubmissionDetail.tsx`, after `submitterFor`, add:

```ts
  // D531: every row of this activity is already loaded, so a pair's partner is found here.
  const byPair = new Map<string, typeof submissions>();
  for (const s of submissions) if (s.pair_id) byPair.set(s.pair_id, [...(byPair.get(s.pair_id) ?? []), s]);
  const withFor = (s: (typeof submissions)[number]) => {
    const other = s.pair_id ? byPair.get(s.pair_id)?.find((x) => x.id !== s.id) : undefined;
    return withText(other ? submitterFor(other.attendee_id).name : null);
  };
```

Pass `withFor={withFor}` to `<SubmissionTable … />`, and add the import `import { withText } from "../../lib/pairs";`.

In `SubmissionTable.tsx`:
- add `withFor` to the props, typed `withFor?: (s: ActivitySubmission) => string | null;`;
- under the `Added by` line in the name cell, add:

```tsx
                {withFor?.(submission) && <div className="text-xs text-muted-foreground">{withFor(submission)}</div>}
```

- [ ] **Step 3: Verifier card**

In `VerifyPage.tsx`:
- add `pairPartnerIds` to an import from `../db/activities`, and `import { withText } from "../lib/pairs";`;
- after `rows` is read, change the people load so partners' names come too:

```ts
  const partners = await pairPartnerIds(rows);
  const [people, groups, verifiers] = await Promise.all([
    listAttendeesByIds(ev.id, [...new Set([...rows.map((r) => r.attendee_id), ...partners.values()])]),
    listGroups(ev.id),
    verifierNames(rows.flatMap((r) => [r.revoked_by_verifier, r.approved_by_verifier])),
  ]);
```

- pass `together={withText(partners.has(s.id) ? nameOf.get(partners.get(s.id)!) : null)}` to `VerifyCard`.

In `VerifyCard.tsx`:
- add the prop `together: string | null;` (doc: `D531: "With <name>" for a tagged pair.`);
- render it right after the `CardDescription` that shows the activity, group and time:

```tsx
        {together && <CardDescription className="text-xs">{together}</CardDescription>}
```

- [ ] **Step 4: Type-check, lint, test, commit**

Run `npx tsc --noEmit`, `npm run lint` and `npm test`. Expected: clean.

```bash
git add src/features/activities/kinds/submission src/features/activities/verify
git commit -m "feat(activities): With <name> on paired entries - history, tracker, admin, verifier (D531)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end check on ecpkom, then clean up

**Files:** none. Fixes go to the owning task's files as `fix(...)` commits.

- [ ] **Step 1: Build**

Run `npm run build`. Expected: success.

- [ ] **Step 2: Throwaway setup (SQL, ecpkom only)**

Make these, recording every id for cleanup:

```sql
with ev as (select id, org_id from events where slug='ecpkom'),
act as (insert into activities (org_id, event_id, name, kind, is_open, allow_pair, attendee_edit, group_mode, per_day, questions, scoring, show_leaderboard, categories)
  select ev.org_id, ev.id, 'ZZ Pair test', 'submission', true, true, true, a.group_mode, false, a.questions, a.scoring, true, null
  from activities a, ev where a.id = 'e1704208-c9e1-4dff-8bcb-b899e5bf3d7c' returning id),
grp as (insert into event_groups (org_id, event_id, name) select org_id, id, 'ZZ Pair Team B' from ev returning id)
update attendees set group_id = (select id from grp) where token = 'u9ws4ftatd4b' and event_id = (select id from ev)
returning (select id from act) act_id, (select id from grp) grp_b;
insert into verifier_links (event_id, name, token) select id, 'ZZ Pair Verifier', 'zzpairvfy7k2' from events where slug='ecpkom' returning id;
```

This copies Project Active's questions and scoring, so the form has the minutes question and its photos.

- [ ] **Step 3: Browser checks** (dev server `preview_start {name:"dev"}`, phone width)

As CS (`/e/ecpkom/a/beknxtsrdtgr/activities/<act>`):
1. The submit dialog shows "Did this with someone from another team?". It lists **ZZ Pair Team B → ZZ Consent Test**, and not Team 1 people.
2. Submit with that tag. The flash says "Submitted with ZZ Consent Test. Thanks!". CS's tracker shows the entry with "With ZZ Consent Test".
3. As ZZ Consent Test (`u9ws4ftatd4b`), the same entry shows "With CS". The Leaderboard tab shows both teams with points.
4. **Refusals:**
   - Set `attendee_edit` and so on as they are, then `update activities set max_per_attendee=1, group_mode='off' where id='<act>'`. Submit again with the tag. Expected: "ZZ Consent Test has reached the limit for this activity." No new rows.
   - Reset with `update activities set max_per_attendee=null, group_mode='members' where id='<act>'`.
   - A same-team tag can't be picked in the UI. Post it directly by changing the select's value in the page to Tan Wei Jie's attendee id with `javascript_tool`, then submit. Expected: "Tan Wei Jie is on your team. Tag someone from another team."
5. **Linked edit:** CS edits today's entry and changes the minutes. Both rows show the new value (check with SQL `select attendee_id, answers from activity_submissions where activity_id='<act>'`).
6. **Verifier** `/verify/zzpairvfy7k2`: both cards show "With …". Approve one: both are approved (SQL). Undo, then revoke one with a reason: both are revoked with the same reason (SQL).
7. **Linked delete:** submit a new tagged entry, then ZZ Consent Test deletes it. Both rows are gone (SQL), and the file objects are gone (check `storage.objects` for the paths).
8. **Shared files (D534)**, with a throwaway attendee:
   - Insert a test attendee `ZZ Pair Temp` in ZZ Pair Team B (category null, a token), tag them from CS, then delete them via admin → Attendees → delete, or via SQL by calling nothing else.
   - CS's row must still name its photo paths, and those objects must still exist.

   If the admin session isn't signed in, run D534 through SQL only: confirm the partner row and storage objects remain after `deleteAttendees`. That function is only reachable from admin, so record it as **not browser-verified** if admin is unavailable.
9. `read_console_messages {onlyErrors:true}` shows nothing except dev-only HMR socket noise.

- [ ] **Step 4: Clean up (ids recorded in Step 2, exact ids only)**

```sql
delete from activity_submissions where activity_id='<act>';
delete from activities where id='<act>';
update attendees set group_id=null where token='u9ws4ftatd4b' and group_id='<grp_b>';
delete from event_groups where id='<grp_b>';
delete from verifier_links where token='zzpairvfy7k2';
```

Also delete any `ZZ Pair Temp` attendee left over, and storage objects under `<org>/<ecpkom>/<act>/`.

Never run a delete that isn't filtered by these ids. The ecphub committee is using live entries.

- [ ] **Step 5: Commit any fixes**

Commit each fix with its owning task's scope (`fix(activities): …` / `fix(portal): …`), with the Co-Authored-By trailer. Do not push.
