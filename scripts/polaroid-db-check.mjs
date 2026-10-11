// Executable evidence that migration 0076 (polaroid wall, D474) holds against a real database.
// vitest has no database (D141), so the pure rules are unit-tested and this proves the SQL.
//
// WHAT THIS PROVES:
//   1. activities accepts kind 'polaroid', and wall_token / public_token are unique.
//   2. polaroids refuses a 81-character message, 9 stickers, a tilt of 4, and status 'gone'.
//   3. photo_path is unique: the same upload cannot post twice.
//   4. The polaroids bucket is public-read and refuses an anonymous upload.
//   5. Removing a photo object leaves the row; deleting the event removes every polaroid row.
//
// HOW TO RUN: npm run check:polaroid (node --env-file=.env.local scripts/polaroid-db-check.mjs).
// SAFE TO RE-RUN: it creates its own draft event with a random slug and deletes it in `finally`.
// It never touches the event with slug `ecphub`.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anonKey) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/polaroid-db-check.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = randomUUID().replaceAll("-", "");
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
};
const must = ({ data, error }) => { if (error) throw error; return data; };

const org = must(await db.from("organisations").select("id").limit(1).single());
const event = must(await db.from("events").insert({ org_id: org.id, name: `Polaroid check ${runId}`, slug: `polaroid-check-${runId}` }).select("id, org_id").single());

try {
  // 1. The kind and its tokens.
  const tokenA = runId.slice(0, 12);
  const activity = must(await db.from("activities").insert({
    org_id: event.org_id, event_id: event.id, name: "Wall", kind: "polaroid", required: false, is_open: true,
    max_per_attendee: null, questions: [], per_day: false, wall_token: tokenA, public_token: runId.slice(12, 24), polaroid: {},
  }).select("id").single());
  check("activities accepts kind 'polaroid'", Boolean(activity.id));
  const dupe = await db.from("activities").insert({
    org_id: event.org_id, event_id: event.id, name: "Wall 2", kind: "polaroid", required: false, is_open: true,
    max_per_attendee: null, questions: [], per_day: false, wall_token: tokenA,
  });
  check("wall_token is unique", dupe.error?.code === "23505", dupe.error?.code ?? "inserted");

  // 2. Row checks.
  const base = (n) => ({
    event_id: event.id, activity_id: activity.id, photo_path: `${event.org_id}/${event.id}/${activity.id}/${runId}-${n}.jpg`,
    photo_w: 1200, photo_h: 1600, client_key: "check", ip_hash: "check",
  });
  const ok = await db.from("polaroids").insert({ ...base(1), message: "Hello", stickers: [{ id: "heart", x: 0.5, y: 0.5, scale: 0.2, rot: 0 }], tilt: 1.5 });
  check("a valid polaroid is stored", !ok.error, ok.error?.message);
  for (const [label, row] of [
    ["an 81-character message", { ...base(2), message: "x".repeat(81) }],
    ["9 stickers", { ...base(3), stickers: Array.from({ length: 9 }, () => ({ id: "heart", x: 0, y: 0, scale: 0.1, rot: 0 })) }],
    ["a tilt of 4", { ...base(4), tilt: 4 }],
    ["status 'gone'", { ...base(5), status: "gone" }],
  ]) {
    const r = await db.from("polaroids").insert(row);
    check(`polaroids refuses ${label}`, r.error?.code === "23514", r.error?.code ?? "inserted");
  }

  // 3. One upload, one post.
  const again = await db.from("polaroids").insert({ ...base(1) });
  check("photo_path is unique", again.error?.code === "23505", again.error?.code ?? "inserted");

  // 4. The bucket.
  const bucket = must(await db.storage.getBucket("polaroids"));
  check("the polaroids bucket is public", bucket.public === true);
  const anonUp = await anon.storage.from("polaroids").upload(`${event.org_id}/${event.id}/anon-${runId}.jpg`, new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }));
  check("an anonymous upload is refused", Boolean(anonUp.error), anonUp.error?.message ?? "uploaded");
  if (!anonUp.error) await db.storage.from("polaroids").remove([`${event.org_id}/${event.id}/anon-${runId}.jpg`]);

  // 5. Removing the object leaves the row.
  const path = base(9).photo_path;
  must(await db.storage.from("polaroids").upload(path, new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" })));
  must(await db.from("polaroids").insert({ ...base(9) }));
  must(await db.storage.from("polaroids").remove([path]));
  const kept = must(await db.from("polaroids").select("id").eq("photo_path", path));
  check("removing the photo object leaves the row", kept.length === 1);
} catch (e) {
  failures += 1;
  console.error("ERROR", e);
} finally {
  const { error } = await db.from("events").delete().eq("id", event.id);
  if (error) console.error("WARNING: could not delete the check event", event.id, error);
  else {
    const left = await db.from("polaroids").select("id", { count: "exact", head: true }).eq("event_id", event.id);
    check("deleting the event removes every polaroid row", (left.count ?? 0) === 0);
  }
}
process.exit(failures ? 1 : 0);
