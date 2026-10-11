// Load and burst test for the polaroid wall (spec 2026-10-11-polaroid-wall-design.md, D405.6).
//
//   seed    <activity-id> <photo-folder> [n=150] [seconds=60]   post n polaroids over `seconds`, cycling the folder's JPEGs
//   cleanup <activity-id>                                        delete every seeded polaroid and its photo
//
// HOW TO RUN: npm run load:polaroid -- seed <id> ./some-photos 150 60
// While `seed` runs, watch the wall: spotlights queue, shorten to 3 s above 5 waiting, and past 15
// the rest slide straight into the columns; memory stays flat.
//
// SAFETY: refuses any activity whose event's slug is `ecphub` (the live event). Only ever touches
// rows it seeded itself (client_key = 'load'), and their photos.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: npm run load:polaroid -- <command> ...");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const must = ({ data, error }) => { if (error) throw error; return data; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [command, activityId, ...rest] = process.argv.slice(2);

const activity = must(await db.from("activities").select("id, event_id, kind, events(slug, org_id)").eq("id", activityId ?? "").maybeSingle());
if (!activity || activity.kind !== "polaroid") { console.error("No polaroid activity with that id."); process.exit(1); }
if (activity.events.slug === "ecphub") { console.error("Refusing: that is the live ecphub event."); process.exit(1); }
const folder = `${activity.events.org_id}/${activity.event_id}/${activity.id}`;

if (command === "seed") {
  const [dir, nArg = "150", secondsArg = "60"] = rest;
  const photos = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).map((f) => readFileSync(path.join(dir, f)));
  if (photos.length === 0) { console.error("No .jpg files in", dir); process.exit(1); }
  const n = Number(nArg);
  const gap = (Number(secondsArg) * 1000) / n;
  for (let i = 0; i < n; i++) {
    const photo = `${folder}/${randomUUID()}.jpg`;
    must(await db.storage.from("polaroids").upload(photo, photos[i % photos.length], { contentType: "image/jpeg" }));
    must(await db.from("polaroids").insert({
      event_id: activity.event_id, activity_id: activity.id, photo_path: photo, photo_w: 1200, photo_h: 1600,
      message: `Load test ${i + 1}`, stickers: [{ id: "star", x: 0.8, y: 0.2, scale: 0.18, rot: 12 }],
      tilt: Math.round((Math.random() * 6 - 3) * 100) / 100, client_key: "load", ip_hash: "load",
    }));
    process.stdout.write(`\rposted ${i + 1}/${n}`);
    await sleep(gap);
  }
  console.log("\ndone");
} else if (command === "cleanup") {
  const rows = must(await db.from("polaroids").select("id, photo_path").eq("activity_id", activity.id).eq("client_key", "load"));
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    must(await db.storage.from("polaroids").remove(batch.map((r) => r.photo_path)));
    must(await db.from("polaroids").delete().in("id", batch.map((r) => r.id)));
  }
  console.log(`deleted ${rows.length}`);
} else {
  console.error("Usage: seed <activity-id> <photo-folder> [n] [seconds] | cleanup <activity-id>");
  process.exit(1);
}
