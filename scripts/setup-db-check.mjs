// Executable evidence that the setup tables (supabase/migrations/0071_event_setup.sql and
// 0072's seed column) behave as the spec says against a real database. vitest has no database
// (D141); the apply rules are pure and tested in tests/setup.
//
// WHAT THIS PROVES:
//   1. setup_token is unique across events (D441).
//   2. event_setup_sections refuses an unknown section and a second row for the same section.
//   3. The rev guard (D446): an update carrying the current rev lands and bumps it; one carrying
//      a stale rev changes nothing.
//   4. The seed (D450): a row inserted with a seed stores it, and an update that doesn't set
//      seed leaves it unchanged (no trigger or default rewrites it). The app's insert-only seed
//      write (saveAnswers in the setup feature's db.ts) is covered by code review, not by this
//      script.
//   5. Deleting the event removes its section rows (cascade).
//   6. event_setup_items and event_setup_files refuse bad rows: a long note, a second row for the
//      same item, a repeated path.
//   7. The setup-files bucket is private and capped at 25 MB.
//   8. setup_apply_agenda writes a plan's days and sessions with the map and the applied snapshot.
//      A stale reviewed version writes but isn't marked. A plan with a failing row writes nothing.
//   9. The public key can't run the function.
//
// HOW TO RUN: npm run check:setup (node --env-file=.env.local scripts/setup-db-check.mjs).
// SAFE TO RE-RUN: it creates two draft events (status set explicitly) with random slugs and deletes them in `finally`.
// It never writes to any other event.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/setup-db-check.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = randomUUID().replaceAll("-", "");
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
};
const must = ({ data, error }) => { if (error) throw error; return data; };

const org = must(await db.from("organisations").select("id").limit(1).single());
const token = `zz${runId.slice(0, 10)}`;
let a;
let b;

try {
  a = must(await db.from("events").insert({ org_id: org.id, name: `Setup check ${runId}`, slug: `setup-check-${runId}`, status: "draft", setup_token: token }).select("id").single());
  b = must(await db.from("events").insert({ org_id: org.id, name: `Setup check b ${runId}`, slug: `setup-check-b-${runId}`, status: "draft" }).select("id").single());

  // 1. Unique token.
  const dup = await db.from("events").update({ setup_token: token }).eq("id", b.id);
  check("a setup token can't be given to a second event", dup.error?.code === "23505", dup.error?.code);

  // 2. Section rows. The first row also carries a seed (checked in 4).
  const seed = { venue: "seed venue" };
  must(await db.from("event_setup_sections").insert({ event_id: a.id, section: "basics", answers: { name: "x" }, seed, rev: 1 }));
  const bad = await db.from("event_setup_sections").insert({ event_id: a.id, section: "raffle", answers: {} });
  check("an unknown section is refused", bad.error?.code === "23514", bad.error?.code);
  const twice = await db.from("event_setup_sections").insert({ event_id: a.id, section: "basics", answers: {} });
  check("a second basics row is refused", twice.error?.code === "23505", twice.error?.code);

  // 3. Rev guard.
  const ok = must(await db.from("event_setup_sections").update({ answers: { name: "y" }, rev: 2 }).eq("event_id", a.id).eq("section", "basics").eq("rev", 1).select("rev"));
  check("a save with the current rev lands and bumps it", ok.length === 1 && ok[0].rev === 2);
  const stale = must(await db.from("event_setup_sections").update({ answers: { name: "z" }, rev: 2 }).eq("event_id", a.id).eq("section", "basics").eq("rev", 1).select("rev"));
  const after = must(await db.from("event_setup_sections").select("answers, rev, seed").eq("event_id", a.id).eq("section", "basics").single());
  check("a save with a stale rev changes nothing", stale.length === 0 && after.answers.name === "y" && after.rev === 2);

  // 4. Seed: stored on insert, untouched by an update that doesn't set it.
  check("a row inserted with a seed stores it", after.seed?.venue === "seed venue" && Object.keys(after.seed).length === 1);
  check("an update that doesn't set seed leaves it unchanged (no trigger or default rewrites it)", after.answers.name === "y" && after.seed?.venue === "seed venue" && Object.keys(after.seed).length === 1);

  // 6. The hub's tables.
  const long = await db.from("event_setup_items").insert({ event_id: a.id, item_key: "info", notes: "x".repeat(4001) });
  check("a note over 4000 characters is refused", long.error?.code === "23514", long.error?.code);
  must(await db.from("event_setup_items").insert({ event_id: a.id, item_key: "info", notes: "hi" }));
  const again = await db.from("event_setup_items").insert({ event_id: a.id, item_key: "info" });
  check("a second row for the same item is refused", again.error?.code === "23505", again.error?.code);
  const filePath = `${org.id}/${a.id}/${randomUUID()}.pdf`;
  must(await db.from("event_setup_files").insert({ event_id: a.id, item_key: "info", path: filePath, name: "a.pdf", size_bytes: 1, content_type: "application/pdf" }));
  const dupPath = await db.from("event_setup_files").insert({ event_id: a.id, item_key: "info", path: filePath, name: "b.pdf", size_bytes: 1, content_type: "application/pdf" });
  check("two files can't share a path", dupPath.error?.code === "23505", dupPath.error?.code);

  // 7. The bucket.
  const bucket = must(await db.storage.getBucket("setup-files"));
  check("the setup-files bucket is private and capped at 25 MB", bucket.public === false && Number(bucket.file_size_limit) === 26214400);

  // 8. setup_apply_agenda.
  const T = "2026-10-10T00:00:00+00:00";
  must(await db.from("event_setup_sections").insert({ event_id: a.id, section: "agenda", answers: {}, submitted: { v: 1 }, submitted_at: T, rev: 1 }));
  const dayId = randomUUID();
  const itemId = randomUUID();
  const none = { insert: [], update: [], delete: [] };
  const firstPlan = {
    days: { ...none, insert: [{ id: dayId, date: "2027-01-10", name: "Day 1" }] },
    items: { ...none, insert: [{ id: itemId, day_id: dayId, starts_at: "09:00", ends_at: null, title: "Keynote", description: null, location: "Hall", sort_order: 10 }] },
    order: [],
  };
  const marked = must(await db.rpc("setup_apply_agenda", { p_event: a.id, p_plan: firstPlan, p_map: { d1: dayId, s1: itemId }, p_reviewed_at: T, p_submitted: { v: 1 } }));
  const rows = must(await db.from("agenda_items").select("id, day, location").eq("event_id", a.id));
  const sec = must(await db.from("event_setup_sections").select("applied, applied_map").eq("event_id", a.id).eq("section", "agenda").single());
  check("an agenda plan writes its days and sessions together", marked === true && rows.length === 1 && rows[0].day === "2027-01-10" && rows[0].location === "Hall");
  check("the agenda apply records the map and the applied snapshot", sec.applied_map.s1 === itemId && sec.applied?.v === 1);

  const retitle = { days: none, items: { ...none, update: [{ id: itemId, title: "Opening" }] }, order: [] };
  const staleApply = must(await db.rpc("setup_apply_agenda", { p_event: a.id, p_plan: retitle, p_map: { d1: dayId, s1: itemId }, p_reviewed_at: "2026-10-09T00:00:00+00:00", p_submitted: { v: 2 } }));
  const retitled = must(await db.from("agenda_items").select("title, location").eq("id", itemId).single());
  const after2 = must(await db.from("event_setup_sections").select("applied").eq("event_id", a.id).eq("section", "agenda").single());
  check("an update writes only the fields it names", retitled.title === "Opening" && retitled.location === "Hall");
  check("a stale reviewed version writes its rows but isn't marked applied", staleApply === false && after2.applied?.v === 1);

  const broken = {
    days: none,
    items: { ...none, insert: [
      { id: randomUUID(), day_id: dayId, starts_at: "16:00", ends_at: null, title: "Should vanish", description: null, location: null, sort_order: 30 },
      { id: randomUUID(), day_id: randomUUID(), starts_at: "17:00", ends_at: null, title: "No such day", description: null, location: null, sort_order: 40 },
    ] },
    order: [],
  };
  const failed = await db.rpc("setup_apply_agenda", { p_event: a.id, p_plan: broken, p_map: {}, p_reviewed_at: T, p_submitted: { v: 3 } });
  const stillOne = must(await db.from("agenda_items").select("id").eq("event_id", a.id));
  check("a plan with a failing row writes nothing", !!failed.error && stillOne.length === 1, failed.error?.message);

  // 9. Service role only.
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anonKey) {
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const refused = await anon.rpc("setup_apply_agenda", { p_event: a.id, p_plan: firstPlan, p_map: {}, p_reviewed_at: T, p_submitted: {} });
    check("the public key can't run the apply function", !!refused.error, refused.error?.code);
  }
} catch (e) {
  // A setup problem (not a failed check): count it, keep the cause, and still clean up below.
  console.error("Check aborted:", e);
  failures += 1;
} finally {
  // 5. Cascade. Delete whichever events exist; a failed delete is a failure, not a masked error.
  const ids = [a?.id, b?.id].filter(Boolean);
  let deleted = ids.length === 0;
  if (ids.length > 0) {
    const del = await db.from("events").delete().in("id", ids);
    if (del.error) {
      console.error("Cleanup failed - delete these events by hand:", ids, del.error);
      failures += 1;
    } else {
      deleted = true;
    }
  }
  if (a?.id && deleted) {
    const left = await db.from("event_setup_sections").select("event_id").eq("event_id", a.id);
    check("deleting the event removes its section rows", !left.error && left.data.length === 0, left.error?.code);
    const leftItems = await db.from("event_setup_items").select("event_id").eq("event_id", a.id);
    const leftFiles = await db.from("event_setup_files").select("event_id").eq("event_id", a.id);
    check("deleting the event removes its items and files", !leftItems.error && !leftFiles.error && leftItems.data.length === 0 && leftFiles.data.length === 0, leftItems.error?.code ?? leftFiles.error?.code);
  }
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
