// D895: one-off fill of image_dimensions (migration 0135) for the pictures uploaded before
// uploadEventImage started recording each one's size.
//
// WHAT IT DOES: lists every image in the event-media bucket that has no row yet, downloads it,
// reads its width and height with sharp (turned by its EXIF orientation, as browsers show it),
// and inserts the row. It writes only to image_dimensions: no object and no event row changes.
//
// HOW TO RUN: node --env-file=.env.local scripts/backfill-image-dimensions.mjs
// SAFE TO RE-RUN: paths that already have a row are skipped.
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/backfill-image-dimensions.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const BUCKET = "event-media";
const IMAGE = /\.(jpe?g|png|webp|svg)$/i;

/** Every object path under `prefix`, walking folders (list() returns one level). */
async function listAll(prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...(await listAll(path))); // a folder
      else out.push(path);
    }
    if (data.length < 1000) return out;
  }
}

const paths = (await listAll()).filter((p) => IMAGE.test(p));
const { data: have, error: haveErr } = await db.from("image_dimensions").select("path");
if (haveErr) throw haveErr;
const done = new Set(have.map((r) => r.path));
const todo = paths.filter((p) => !done.has(p));
console.log(`${paths.length} images, ${done.size} already recorded, ${todo.length} to read`);

let ok = 0, failed = 0;
for (const path of todo) {
  try {
    const { data: blob, error } = await db.storage.from(BUCKET).download(path);
    if (error) throw error;
    const meta = await sharp(Buffer.from(await blob.arrayBuffer())).metadata();
    if (!meta.width || !meta.height) throw new Error("no size");
    const turned = (meta.orientation ?? 1) >= 5;
    const row = { path, width: turned ? meta.height : meta.width, height: turned ? meta.width : meta.height };
    const { error: insErr } = await db.from("image_dimensions").insert(row);
    if (insErr) throw insErr;
    ok++;
  } catch (e) {
    failed++;
    console.log(`SKIP  ${path}  (${e.message ?? e})`);
  }
}
console.log(`recorded ${ok}, skipped ${failed}`);
