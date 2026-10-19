// Executable evidence that migration 0100 (registration limit, waiting list and approval,
// D677-D703) holds against a real database. vitest has no database (D141), so the pure rules are
// unit-tested and this proves the SQL: every place is taken inside one locked transaction (D688).
//
// WHAT THIS PROVES:
//   1. Limit 2, approval off: the first two registrations are registered, the third waits at 1.
//   2. Ten registrations racing for the last place: exactly one is registered, nine wait at 1-9.
//   3. Re-submitting a waiting email keeps its place and updates its answers (D679).
//   4. An active attendee submitting when full is updated, never queued (D692).
//   5. A cancelled imported attendee re-registering when full waits with their own token, and is
//      moved in on the same row with source 'registration' when a place frees (D692, D695).
//   6. Two fills racing for one freed place move one person; the limit is never passed (D688).
//   7. Nothing moves while registration is closed (switch off, close time past); reopening moves
//      the first in line; a newcomer never jumps the queue while anyone waits (D683, D691).
//   8. Clearing the limit moves everyone waiting in (D691).
//   9. Approval on: a registration is pending and holds a place; decline frees it to the next in
//      line as pending, not registered; approve registers with source 'registration' (D697-D701).
//  10. Leaving while pending frees the place; leaving while waiting moves nobody (D681, D697).
//  11. Move in works when full and closed (to pending with approval on); Remove moves nobody (D685).
//  12. An organiser adding a waiting person closes their entry (D693).
//  12a. A declined person registering again reuses their entry and token with a new joined_at (D702).
//  13. The anon key cannot run register_or_queue, fill_free_places or registration_places.
//  14. Someone already active (restored or added outside the queue) is never admitted from their
//      open entry: it closes against their attendee row, which is left untouched, nothing is
//      reported as moved, and the free place goes to the next in line.
//
// HOW TO RUN: npm run check:queue (node --env-file=.env.local scripts/registration-queue-db-check.mjs).
// SAFE TO RE-RUN: it creates its own events with random slugs and deletes them (and, by cascade,
// their attendees and entries) in `finally`. It never touches the event with slug `ecphub`.
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anonKey) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/registration-queue-db-check.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = randomUUID().replaceAll("-", "").slice(0, 16);
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
};
const must = ({ data, error }) => { if (error) throw error; return data; };

// The app's token shape (src/lib/tokens.ts): 12 symbols, no 0/1/l/i/o.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const newToken = () => {
  let out = "";
  while (out.length < 12) for (const b of randomBytes(24)) if (b < 248 && out.length < 12) out += ALPHABET[b % 31];
  return out;
};

const org = must(await db.from("organisations").select("id").limit(1).single());
const eventIds = [];
let n = 0;
async function makeEvent(fields) {
  n += 1;
  const ev = must(await db.from("events").insert({
    org_id: org.id, name: `Queue check ${runId} ${n}`, slug: `queue-check-${runId}-${n}`, status: "live", registration_open: true, ...fields,
  }).select("id, org_id, slug").single());
  if (ev.slug === "ecphub") throw new Error("refusing to touch ecphub");
  eventIds.push(ev.id);
  return ev;
}
const mail = (ev, who) => `${who}.${runId}@queue-check.test`;
const register = (ev, who, extra = {}, terms = false) => db.rpc("register_or_queue", {
  p_event_id: ev.id, p_name: `Person ${who}`, p_email: mail(ev, who), p_extra: extra,
  p_new_token: newToken(), p_consent_notice: "test-notice", p_terms: terms,
});
const reg = async (ev, who, extra, terms) => must(await register(ev, who, extra, terms))[0];
const fill = async (ev) => must(await db.rpc("fill_free_places", { p_event_id: ev.id }));
const places = async (ev) => must(await db.rpc("registration_places", { p_event_id: ev.id }))[0];
const entryOf = async (ev, who) => must(await db.from("registration_entries").select("*").eq("event_id", ev.id).eq("email", mail(ev, who)).maybeSingle());
const attendeeOf = async (ev, who) => must(await db.from("attendees").select("*").eq("event_id", ev.id).eq("email", mail(ev, who)).maybeSingle());
const cancel = async (attendeeId) => must(await db.from("attendees").update({ cancelled_at: new Date().toISOString() }).eq("id", attendeeId));
const setEvent = async (ev, fields) => must(await db.from("events").update(fields).eq("id", ev.id));

try {
  // 13 first, so a refusal is not masked by anything the service role does below.
  {
    const ev = await makeEvent({ registration_limit: 1 });
    const a = await anon.rpc("register_or_queue", { p_event_id: ev.id, p_name: "Anon", p_email: mail(ev, "anon"), p_extra: {}, p_new_token: newToken(), p_consent_notice: "x", p_terms: false });
    check("13. the anon key cannot run register_or_queue", Boolean(a.error), a.error?.code ?? "it ran");
    const f = await anon.rpc("fill_free_places", { p_event_id: ev.id });
    check("13. the anon key cannot run fill_free_places", Boolean(f.error), f.error?.code ?? "it ran");
    const p = await anon.rpc("registration_places", { p_event_id: ev.id });
    check("13. the anon key cannot run registration_places", Boolean(p.error), p.error?.code ?? "it ran");
    const t = await anon.from("registration_entries").select("id").limit(1);
    check("13. the anon key reads no entries", Boolean(t.error) || (t.data ?? []).length === 0, t.error?.code ?? `${t.data?.length} rows`);
  }

  // 1, 3, 4, 12
  {
    const ev = await makeEvent({ registration_limit: 2 });
    const a = await reg(ev, "a");
    const b = await reg(ev, "b");
    check("1. first registration is registered", a.outcome === "registered" && a.attendee_id && a.entry_id === null, JSON.stringify(a));
    check("1. second registration is registered", b.outcome === "registered", b.outcome);
    const c = await reg(ev, "c", { q: "old" });
    check("1. third registration waits at position 1", c.outcome === "waiting" && c.position === 1 && c.entry_id && !c.attendee_id, JSON.stringify(c));
    const p = await places(ev);
    check("1. places: 2 taken, 1 waiting, full", p.taken === 2 && p.waiting === 1 && p.pending === 0 && p.lim === 2 && p.full_ === true && p.open_ === true, JSON.stringify(p));
    const cAtt = await attendeeOf(ev, "c");
    check("1. a waiting person has no attendee row", cAtt === null);

    const before = await entryOf(ev, "c");
    const c2 = await reg(ev, "c", { q: "new" });
    const after = await entryOf(ev, "c");
    check("3. re-submit of a waiting email still waits at the same position", c2.outcome === "waiting" && c2.position === 1 && c2.entry_id === c.entry_id && c2.token === c.token, JSON.stringify(c2));
    check("3. ... with its answers updated", after.extra.q === "new", JSON.stringify(after.extra));
    check("3. ... and its joined_at kept", after.joined_at === before.joined_at, `${before.joined_at} -> ${after.joined_at}`);

    const a2 = await reg(ev, "a", { q: "again" }, true);
    const aRow = await attendeeOf(ev, "a");
    const aEntry = await entryOf(ev, "a");
    check("4. an active attendee re-submitting when full is updated", a2.outcome === "updated" && a2.attendee_id === a.attendee_id && a2.token === a.token, JSON.stringify(a2));
    check("4. ... with no entry created", aEntry === null);
    check("4. ... and the answers and terms recorded", aRow.extra.q === "again" && aRow.terms_agreed_at !== null && aRow.consented_at !== null, JSON.stringify(aRow.extra));

    // 12. The TS add path creates the attendee with the entry's token, then closes the entry (D693).
    const added = must(await db.from("attendees").insert({ org_id: ev.org_id, event_id: ev.id, token: c.token, name: "Person c", email: mail(ev, "c"), source: "import" }).select("id").single());
    const closed = must(await db.rpc("close_entry_for_attendee", { p_event_id: ev.id, p_email: mail(ev, "c").toUpperCase(), p_attendee_id: added.id }));
    const cEntry = await entryOf(ev, "c");
    check("12. close_entry_for_attendee returns the entry's token", closed === c.token, String(closed));
    check("12. ... and closes the waiting entry as registered", cEntry.state === "registered" && cEntry.attendee_id === added.id && cEntry.decided_at !== null, cEntry.state);
    const again = must(await db.rpc("close_entry_for_attendee", { p_event_id: ev.id, p_email: mail(ev, "c"), p_attendee_id: added.id }));
    check("12. ... and returns null when no active entry is left", again === null, String(again));
  }

  // 2. The race on the last place.
  {
    const ev = await makeEvent({ registration_limit: 1 });
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => register(ev, `race${i}`)));
    const rows = results.map((r) => { if (r.error) throw r.error; return r.data[0]; });
    const registered = rows.filter((r) => r.outcome === "registered");
    const waiting = rows.filter((r) => r.outcome === "waiting").map((r) => r.position).sort((x, y) => x - y);
    check("2. ten racing registrations: exactly one registered", registered.length === 1, rows.map((r) => r.outcome).join(","));
    check("2. ... nine waiting at positions 1-9", JSON.stringify(waiting) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9]), JSON.stringify(waiting));
    const p = await places(ev);
    check("2. ... and one place taken", p.taken === 1 && p.waiting === 9, JSON.stringify(p));
  }

  // 5. A cancelled import comes back.
  {
    const ev = await makeEvent({ registration_limit: 1 });
    const importToken = newToken();
    const imp = must(await db.from("attendees").insert({ org_id: ev.org_id, event_id: ev.id, token: importToken, name: "Imported", email: mail(ev, "imp"), source: "import", cancelled_at: new Date().toISOString(), cancel_reason: "Cannot come", extra: { keep: "yes" } }).select("id").single());
    const x = await reg(ev, "x");
    check("5. the place goes to the first registration", x.outcome === "registered", x.outcome);
    const back = await reg(ev, "imp", { q: "answer" });
    check("5. a cancelled import re-registering when full waits with their own token", back.outcome === "waiting" && back.token === importToken && back.position === 1, JSON.stringify(back));
    const stillCancelled = await attendeeOf(ev, "imp");
    check("5. ... and stays cancelled while waiting", stillCancelled.cancelled_at !== null && stillCancelled.source === "import");
    await cancel(x.attendee_id);
    const moved = await fill(ev);
    check("5. fill moves them in", moved.length === 1 && moved[0].new_state === "registered" && moved[0].attendee_id === imp.id && moved[0].entry_id === back.entry_id, JSON.stringify(moved));
    const row = await attendeeOf(ev, "imp");
    check("5. ... on the same attendee row, active, source 'registration', same token", row.id === imp.id && row.cancelled_at === null && row.cancel_reason === null && row.source === "registration" && row.token === importToken, JSON.stringify({ source: row.source, token: row.token, cancelled_at: row.cancelled_at }));
    check("5. ... with old and new answers kept and consent stamped", row.extra.keep === "yes" && row.extra.q === "answer" && row.consented_at !== null && row.consent_notice === "test-notice", JSON.stringify(row.extra));
    const e = await entryOf(ev, "imp");
    check("5. ... and the entry is registered and linked", e.state === "registered" && e.attendee_id === imp.id, e.state);
  }

  // 6. Two fills racing for one freed place.
  {
    const ev = await makeEvent({ registration_limit: 1 });
    const p1 = await reg(ev, "p1");
    const p2 = await reg(ev, "p2");
    const p3 = await reg(ev, "p3");
    await cancel(p1.attendee_id);
    const [m1, m2] = await Promise.all([fill(ev), fill(ev)]);
    check("6. two parallel fills move exactly one entry", m1.length + m2.length === 1, `${m1.length}+${m2.length}`);
    const p = await places(ev);
    check("6. ... and registered never passes the limit", p.taken === 1 && p.waiting === 1, JSON.stringify(p));
    check("6. ... it was the first in line", (await entryOf(ev, "p2")).state === "registered" && (await entryOf(ev, "p3")).state === "waiting");
    check("6. ... the moved entry kept its token on the new attendee", (await attendeeOf(ev, "p2")).token === p2.token && p3.position === 2);
  }

  // 7. Closed means nobody moves; reopening moves the first in line; the queue is never skipped.
  {
    const ev = await makeEvent({ registration_limit: 1 });
    const r1 = await reg(ev, "r1");
    await reg(ev, "r2");
    await reg(ev, "r3");
    await setEvent(ev, { registration_open: false });
    await cancel(r1.attendee_id);
    const none = await fill(ev);
    check("7. switch off + place free: fill moves nobody", none.length === 0, JSON.stringify(none));
    check("7. ... and places say closed", (await places(ev)).open_ === false);
    await setEvent(ev, { registration_open: true, registration_closes_at: new Date(Date.now() - 60_000).toISOString() });
    const none2 = await fill(ev);
    check("7. close time past + place free: fill moves nobody", none2.length === 0, JSON.stringify(none2));
    await setEvent(ev, { registration_closes_at: null });
    const one = await fill(ev);
    check("7. reopened: fill moves the first waiting entry", one.length === 1 && one[0].entry_id === (await entryOf(ev, "r2")).id && one[0].new_state === "registered", JSON.stringify(one));
    await setEvent(ev, { registration_limit: 3 }); // two places free, r3 still waiting, no fill run yet
    const r4 = await reg(ev, "r4");
    check("7. a newcomer while anyone waits joins the waiting list, behind them (D691)", r4.outcome === "waiting" && r4.position === 2, JSON.stringify(r4));
    const two = await fill(ev);
    check("7. ... and the next fill moves both in, in order", two.length === 2 && two[0].entry_id === (await entryOf(ev, "r3")).id && two[1].entry_id === r4.entry_id, JSON.stringify(two));
    await setEvent(ev, { status: "archived" });
    check("7. an archived event is closed", (await places(ev)).open_ === false);
  }

  // 8. Clearing the limit.
  {
    const ev = await makeEvent({ registration_limit: 1 });
    await reg(ev, "s1");
    await reg(ev, "s2");
    await reg(ev, "s3");
    await setEvent(ev, { registration_limit: null });
    check("8. with no limit the event is never full", (await places(ev)).full_ === false);
    const all = await fill(ev);
    check("8. clearing the limit moves everyone waiting in", all.length === 2 && all.every((m) => m.new_state === "registered" && m.attendee_id), JSON.stringify(all));
    const p = await places(ev);
    check("8. ... nobody is left waiting", p.waiting === 0 && p.taken === 3, JSON.stringify(p));
  }

  // 9, 11 (approval), 12a. Approval on.
  {
    const ev = await makeEvent({ registration_limit: 1, registration_needs_approval: true });
    const t1 = await reg(ev, "t1", {}, true);
    check("9. approval on: a new registration is pending", t1.outcome === "pending" && t1.entry_id && !t1.attendee_id && t1.position === null, JSON.stringify(t1));
    const p = await places(ev);
    check("9. ... and holds a place", p.taken === 1 && p.pending === 1 && p.full_ === true, JSON.stringify(p));
    const t2 = await reg(ev, "t2");
    const t3 = await reg(ev, "t3");
    check("9. ... so the next ones wait", t2.outcome === "waiting" && t2.position === 1 && t3.position === 2, `${t2.outcome} ${t2.position} ${t3.position}`);
    const t1Before = await entryOf(ev, "t1");
    const declined = must(await db.rpc("decline_entry", { p_entry_id: t1.entry_id }));
    check("9. decline moves the first waiting entry to pending, not registered", declined.length === 1 && declined[0].entry_id === t2.entry_id && declined[0].new_state === "pending" && declined[0].attendee_id === null, JSON.stringify(declined));
    check("9. ... the declined entry is declined", (await entryOf(ev, "t1")).state === "declined");
    check("9. ... and no attendee exists for the new pending one", (await attendeeOf(ev, "t2")) === null);
    const approved = must(await db.rpc("approve_entry", { p_entry_id: t2.entry_id }));
    const t2Att = await attendeeOf(ev, "t2");
    check("9. approve registers them", approved.length === 1 && approved[0].attendee_id === t2Att?.id, JSON.stringify(approved));
    check("9. ... active, source 'registration', on the entry's token", t2Att.cancelled_at === null && t2Att.source === "registration" && t2Att.token === t2.token, JSON.stringify({ source: t2Att.source, token: t2Att.token }));
    check("9. ... and the entry is registered", (await entryOf(ev, "t2")).state === "registered");
    const twice = must(await db.rpc("approve_entry", { p_entry_id: t2.entry_id }));
    check("9. approving twice does nothing", twice.length === 0, JSON.stringify(twice));

    // 11 with approval: Move in goes to pending, even when full.
    const mv = must(await db.rpc("move_in_entry", { p_entry_id: t3.entry_id }));
    check("11. move in with approval on goes to pending, even when full", mv.length === 1 && mv[0].new_state === "pending" && mv[0].attendee_id === null, JSON.stringify(mv));

    // 12a. The declined person tries again (full, so waiting) on the same row and token.
    const t1Again = await reg(ev, "t1");
    const t1After = await entryOf(ev, "t1");
    check("12a. a declined email registering again reuses its entry and token", t1Again.entry_id === t1.entry_id && t1Again.token === t1.token, JSON.stringify(t1Again));
    check("12a. ... waits when full, with a new joined_at", t1Again.outcome === "waiting" && t1Again.position === 1 && new Date(t1After.joined_at) > new Date(t1Before.joined_at), `${t1Again.outcome} ${t1Before.joined_at} -> ${t1After.joined_at}`);
  }
  {
    const ev = await makeEvent({ registration_limit: 1, registration_needs_approval: true });
    const w1 = await reg(ev, "w1");
    must(await db.rpc("decline_entry", { p_entry_id: w1.entry_id }));
    const w1Again = await reg(ev, "w1");
    check("12a. a declined email registering again with a place free is pending on the same entry", w1Again.outcome === "pending" && w1Again.entry_id === w1.entry_id && w1Again.token === w1.token, JSON.stringify(w1Again));
  }

  // 10. Leaving.
  {
    const ev = await makeEvent({ registration_limit: 1, registration_needs_approval: true });
    const u1 = await reg(ev, "u1");
    const u2 = await reg(ev, "u2");
    const u3 = await reg(ev, "u3");
    const leftWaiting = must(await db.rpc("leave_entry", { p_event_id: ev.id, p_token: u3.token }));
    check("10. leaving while waiting moves nobody", leftWaiting.length === 0 && (await entryOf(ev, "u2")).state === "waiting", JSON.stringify(leftWaiting));
    check("10. ... and marks the entry left", (await entryOf(ev, "u3")).state === "left");
    const leftPending = must(await db.rpc("leave_entry", { p_event_id: ev.id, p_token: u1.token }));
    check("10. leaving while pending frees the place: next in line becomes pending", leftPending.length === 1 && leftPending[0].entry_id === u2.entry_id && leftPending[0].new_state === "pending", JSON.stringify(leftPending));
    check("10. ... and marks the entry left", (await entryOf(ev, "u1")).state === "left");
    const wrongEvent = must(await db.rpc("leave_entry", { p_event_id: randomUUID(), p_token: u2.token }));
    check("10. leave_entry with another event's id changes nothing", wrongEvent.length === 0 && (await entryOf(ev, "u2")).state === "pending");
  }

  // 11. Move in and Remove, approval off, full and closed.
  {
    const ev = await makeEvent({ registration_limit: 1 });
    await reg(ev, "v1");
    const v2 = await reg(ev, "v2");
    const v3 = await reg(ev, "v3");
    await setEvent(ev, { registration_open: false });
    const mv = must(await db.rpc("move_in_entry", { p_entry_id: v3.entry_id }));
    check("11. move in works when full and closed", mv.length === 1 && mv[0].entry_id === v3.entry_id && mv[0].new_state === "registered" && mv[0].attendee_id, JSON.stringify(mv));
    check("11. ... the count goes over the limit (D694)", (await places(ev)).taken === 2);
    const mvAgain = must(await db.rpc("move_in_entry", { p_entry_id: v3.entry_id }));
    check("11. move in on an entry that is not waiting does nothing", mvAgain.length === 0);
    const removed = must(await db.rpc("remove_entry", { p_entry_id: v2.entry_id }));
    const p = await places(ev);
    check("11. remove takes a waiting entry off", removed === true && (await entryOf(ev, "v2")).state === "removed", String(removed));
    check("11. ... and changes nothing else", p.taken === 2 && p.waiting === 0 && p.pending === 0 && (await attendeeOf(ev, "v2")) === null, JSON.stringify(p));
    const removedAgain = must(await db.rpc("remove_entry", { p_entry_id: v2.entry_id }));
    check("11. removing twice does nothing", removedAgain === false, String(removedAgain));
  }

  // 14. Someone already active is never admitted again (review fix): their open entry closes against
  // the attendee they already are, untouched, and the place goes to the next in line.
  {
    const ev = await makeEvent({ registration_limit: 1 });
    const rs = must(await db.from("attendees").insert({ org_id: ev.org_id, event_id: ev.id, token: newToken(), name: "Imported RS", email: mail(ev, "rs"), source: "import", cancelled_at: new Date().toISOString(), extra: { keep: "yes" } }).select("id").single());
    const f1 = await reg(ev, "f1");
    const rsEntry = await reg(ev, "rs", { q: "queued" });
    const n2 = await reg(ev, "n2");
    check("14a. setup: the cancelled import and a newcomer wait at 1 and 2", rsEntry.outcome === "waiting" && rsEntry.position === 1 && n2.position === 2, `${rsEntry.position} ${n2.position}`);
    // Restore (D588) outside the queue: today it does not call close_entry_for_attendee.
    must(await db.from("attendees").update({ cancelled_at: null }).eq("id", rs.id));
    await cancel(f1.attendee_id);
    const moved = await fill(ev);
    const rsRow = await attendeeOf(ev, "rs");
    const rsAfter = await entryOf(ev, "rs");
    check("14a. fill does not count the restored person as a move", moved.length === 1 && moved[0].entry_id === n2.entry_id && moved[0].new_state === "registered", JSON.stringify(moved));
    check("14a. ... their entry closes, linked to their attendee row", rsAfter.state === "registered" && rsAfter.attendee_id === rs.id && rsAfter.decided_at !== null, `${rsAfter.state} ${rsAfter.attendee_id}`);
    check("14a. ... and their attendee row is untouched", rsRow.source === "import" && rsRow.name === "Imported RS" && rsRow.extra.q === undefined && rsRow.extra.keep === "yes", JSON.stringify({ source: rsRow.source, name: rsRow.name, extra: rsRow.extra }));
    check("14a. ... the next in line took the free place", (await places(ev)).taken === 1 && (await entryOf(ev, "n2")).state === "registered");

    const g1 = await reg(ev, "g1");
    check("14b. setup: a newcomer waits", g1.outcome === "waiting", g1.outcome);
    must(await db.from("attendees").insert({ org_id: ev.org_id, event_id: ev.id, token: newToken(), name: "Added G1", email: mail(ev, "g1"), source: "import" }));
    const g1Again = await reg(ev, "g1");
    const g1Entry = await entryOf(ev, "g1");
    const g1Row = await attendeeOf(ev, "g1");
    check("14b. an active attendee with an open entry re-submitting is updated", g1Again.outcome === "updated" && g1Again.attendee_id === g1Row.id, JSON.stringify(g1Again));
    check("14b. ... and the open entry closes against them", g1Entry.state === "registered" && g1Entry.attendee_id === g1Row.id && g1Entry.decided_at !== null, `${g1Entry.state} ${g1Entry.attendee_id}`);
  }
  {
    // 14c. The same through Move in and Approve: nothing comes back to message, the entry closes.
    const ev = await makeEvent({ registration_limit: 1 });
    await reg(ev, "h0");
    const h1 = await reg(ev, "h1");
    const h1Att = must(await db.from("attendees").insert({ org_id: ev.org_id, event_id: ev.id, token: newToken(), name: "Added H1", email: mail(ev, "h1"), source: "import" }).select("id").single());
    const mv = must(await db.rpc("move_in_entry", { p_entry_id: h1.entry_id }));
    const h1Entry = await entryOf(ev, "h1");
    check("14c. move in of someone already active returns no move and closes the entry", mv.length === 0 && h1Entry.state === "registered" && h1Entry.attendee_id === h1Att.id && (await attendeeOf(ev, "h1")).source === "import", JSON.stringify(mv));
    await setEvent(ev, { registration_needs_approval: true, registration_limit: null });
    const k1 = await reg(ev, "k1");
    const k1Att = must(await db.from("attendees").insert({ org_id: ev.org_id, event_id: ev.id, token: newToken(), name: "Added K1", email: mail(ev, "k1"), source: "import" }).select("id").single());
    const ap = must(await db.rpc("approve_entry", { p_entry_id: k1.entry_id }));
    const k1Entry = await entryOf(ev, "k1");
    check("14c. approve of someone already active returns nothing and closes the entry", k1.outcome === "pending" && ap.length === 0 && k1Entry.state === "registered" && k1Entry.attendee_id === k1Att.id && (await attendeeOf(ev, "k1")).source === "import", JSON.stringify(ap));
  }

  // Events with no limit and approval off behave as today.
  {
    const ev = await makeEvent({});
    const z = await reg(ev, "z", { q: "1" }, true);
    const zRow = await attendeeOf(ev, "z");
    check("no limit, approval off: registered at once, no entry", z.outcome === "registered" && (await entryOf(ev, "z")) === null && zRow.token === z.token && zRow.source === "registration" && zRow.terms_agreed_at !== null, JSON.stringify(z));
  }
} finally {
  if (eventIds.length) {
    const { error } = await db.from("events").delete().in("id", eventIds);
    if (error) console.error("cleanup failed", error);
  }
}

if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log("All checks passed");
