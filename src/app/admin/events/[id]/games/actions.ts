"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent, rotateDisplayToken, rotateHostToken } from "@/lib/db/events";
import { createGame, deleteGame, getGame, listGames, resetDraw, updateGame, GAME_KIND_LABELS, gameMediaUrls, isGameKind, parseConfig, type Game, configFromForm, backgroundFromForm } from "@/features/games";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { acceptImage, acceptVideo, isEventMediaFor, isGameVideoFor, mediaPathInEvent, type ImageKind } from "@/lib/storage";
import { createMediaUpload, deleteEventImage, nextImage } from "@/lib/db/media";
import { eventFeatures, featureForGameKind, has, notPartOf, requireFeature } from "@/features/catalogue";
import { flashPath } from "@/lib/flash";

const gamesPath = (eventId: string) => `/admin/events/${eventId}/games`;

export async function createGameAction(eventId: string, kind: string, form: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  if (!isGameKind(kind)) redirect(flashPath(gamesPath(ev.id), "That kind of game does not exist.", "error"));
  await requireFeature(ev.id, featureForGameKind(kind), gamesPath(ev.id));
  const title = (String(form.get("title") ?? "").trim() || GAME_KIND_LABELS[kind]).slice(0, 80);
  const game = await createGame(ev, kind, title);
  revalidatePath(gamesPath(ev.id));
  // Straight into its editor: a race is ready as it is, but questions and prizes are not.
  redirect(`${gamesPath(ev.id)}/${game.id}`);
}

export async function deleteGameAction(eventId: string, gameId: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  await deleteGame(gameId, ev.id);
  revalidatePath(gamesPath(ev.id));
  redirect(flashPath(gamesPath(ev.id), "Game deleted."));
}

/** Rotation is the revocation (D252): every copy of the old link stops at once. */
export async function rotateHostTokenAction(eventId: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  await rotateHostToken(ev.id);
  revalidatePath(gamesPath(ev.id));
  redirect(flashPath(gamesPath(ev.id), "New host link ready. The old one has stopped working."));
}

export async function rotateDisplayTokenAction(eventId: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  await rotateDisplayToken(ev.id);
  revalidatePath(gamesPath(ev.id));
  redirect(flashPath(gamesPath(ev.id), "New display link ready. The old one has stopped working."));
}

export async function updateGameAction(eventId: string, gameId: string, form: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const game = await getGame(gameId, ev.id);
  if (!game) redirect(flashPath(gamesPath(ev.id), "That game no longer exists.", "error"));
  await requireFeature(ev.id, featureForGameKind(game.kind), gamesPath(ev.id));
  const path = `${gamesPath(ev.id)}/${game.id}`;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const parsed = configFromForm(game.kind, form);
  if (!parsed.ok) redirect(flashPath(path, parsed.error, "error"));
  // A draw's checkpoint must be one of this event's: another event's checkpoint (or a deleted
  // one) has none of this event's check-ins, so the draw would have nobody to draw from.
  if (game.kind === "draw") {
    const checkpointId = (parsed.config as { checkpoint_id: string | null }).checkpoint_id;
    if (checkpointId && !(await listCheckpoints(ev.id)).some((c) => c.id === checkpointId)) {
      redirect(flashPath(path, "That checkpoint is not on this event any more. Pick another and save again.", "error"));
    }
    // A prize picture or the card back rides a plain hidden field, entirely client-controlled:
    // it must name an image WE minted for THIS event, of the right kind — never merely some
    // object that happens to sit in the shared bucket, the same rule backgroundFromForm's
    // `ours` check applies to the background video below.
    const cfg = parsed.config as { prizes: { image: string | null }[]; card_back: string | null };
    const badImage = cfg.prizes.some((p) => p.image && !isEventMediaFor(p.image, supabaseUrl, ev.org_id, ev.id, ["game-prize"]));
    const badCardBack = cfg.card_back && !isEventMediaFor(cfg.card_back, supabaseUrl, ev.org_id, ev.id, ["game-card-back"]);
    if (badImage || badCardBack) redirect(flashPath(path, "That picture was not uploaded here. Upload it again.", "error"));
  }
  // The LED background (D297, D300). An image uploads with this save; a video was already
  // uploaded by the browser, and is accepted only if it is in our bucket.
  const current = game.config.background;
  const kind = String(form.get("background_kind") ?? current.kind);
  let image: string | null = null;
  if (kind === "image") {
    try {
      image = (await nextImage(form, "background_image", current.kind === "image" ? current.url : null,
        { orgId: ev.org_id, eventId: ev.id, kind: "game-background" })).url;
    } catch (e) {
      redirect(flashPath(path, (e as Error).message, "error"));
    }
  }
  const bg = backgroundFromForm(kind, {
    image,
    video: String(form.get("background_video") ?? "").trim() || null,
    // The hidden field is client-controlled: it must name a game video WE minted for THIS
    // event, never merely some object that happens to sit in the shared bucket (another
    // event's or org's upload), or the delete below could remove a file another row still
    // points at.
    ours: (u) => isGameVideoFor(u, supabaseUrl, ev.org_id, ev.id),
  });
  if (!bg.ok) redirect(flashPath(path, bg.error, "error"));
  // Typed rather than cast: parsed.config already passed this kind's schema (configFromForm),
  // so re-reading it through parseConfig keeps the stored shape checked by tsc instead of
  // trusting an `as Record<string, unknown>` that would compile no matter what shape it held.
  const typedConfig = parseConfig(game.kind, parsed.config);
  if (!typedConfig) redirect(flashPath(path, "Something on the form is not right. Check it and save again.", "error"));
  const title = (String(form.get("title") ?? "").trim() || game.title).slice(0, 80);
  // Every media URL (the background, and for a draw, each prize's picture and the card back)
  // this save drops or replaces — diffed here, against the config that is ABOUT to be stored,
  // so the write itself is not delayed by it. `newConfig` is the exact shape `updateGame` writes
  // below: `typedConfig`'s own `background` is only a placeholder (configFromForm never reads
  // the background_kind/_image/_video fields — backgroundFromForm does, above), so the real one
  // is spliced in here too, same as the write.
  const newConfig = { ...typedConfig, background: bg.background };
  const oldUrls = gameMediaUrls(game);
  const newUrls = new Set(gameMediaUrls({ ...game, config: newConfig } as Game));
  const staleMedia = oldUrls.filter((u) => !newUrls.has(u));
  await updateGame(game.id, ev.id, { title, config: newConfig });
  if (staleMedia.length > 0) {
    // A URL this save drops might still be in use by another game of this event — its
    // background, or (for a draw) a prize picture or card back — whether through a legitimate
    // reused upload or a crafted post copying another game's URL in and back out. Deleting it
    // here would pull the file out from under whichever other game still names it, so every
    // other game of the event (any kind, not only draws) is checked before anything is removed.
    // Only when it is actually ours to remove, too: a URL outside this event's folder is left
    // alone rather than handed to the service-role delete (mirrors nextImage's own delete).
    const others = (await listGames(ev.id)).filter((g) => g.id !== game.id);
    const inUseElsewhere = new Set(others.flatMap(gameMediaUrls));
    for (const u of staleMedia) {
      if (inUseElsewhere.has(u)) continue;
      if (mediaPathInEvent(u, supabaseUrl, ev.org_id, ev.id)) await deleteEventImage(u);
    }
  }
  revalidatePath(path);
  revalidatePath(gamesPath(ev.id));
  redirect(flashPath(path, "Saved."));
}

/** Mints the signed URL a background video uploads to (D300), after checking the game is this event's and the file is one we take. */
export async function backgroundVideoUploadAction(eventId: string, gameId: string, type: string, size: number): Promise<{ ok: true; path: string; token: string; url: string } | { ok: false; error: string }> {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const game = await getGame(gameId, ev.id);
  if (!game) return { ok: false, error: "That game no longer exists." };
  if (!has(await eventFeatures(ev.id), featureForGameKind(game.kind))) return { ok: false, error: notPartOf(featureForGameKind(game.kind)) };
  let ext: string;
  try {
    ext = acceptVideo({ type: String(type), size: Number(size) });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  try {
    return { ok: true, ...(await createMediaUpload({ orgId: ev.org_id, eventId: ev.id, kind: "game-video", ext })) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Mints the signed URL a prize picture or a card back uploads to (D323), after checking the
 * game is this event's draw and the file is one we take. Up to 50 prizes can each carry one,
 * plus the one card back, so this mints a fresh path per upload rather than the game reusing one.
 *
 * `acceptImage`'s type/size check here is advisory, not the hard limit: it is what lets the
 * organiser read "PNG, JPEG, WebP or SVG, up to 4 MB" before the file ever leaves the browser,
 * the same as everywhere else `acceptImage` runs client-side first. The browser then uploads
 * straight to Storage with the signed URL this mints, past this Server Action entirely — the
 * bucket's own MIME allow-list and its size cap (30 MB, the same bucket the background video
 * uses) are what actually refuse an upload that disagrees with what was checked here.
 */
export async function gameImageUploadAction(
  eventId: string, gameId: string, kind: "prize" | "card-back", type: string, size: number,
): Promise<{ ok: true; path: string; token: string; url: string } | { ok: false; error: string }> {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const game = await getGame(gameId, ev.id);
  if (!game) return { ok: false, error: "That game no longer exists." };
  if (!has(await eventFeatures(ev.id), featureForGameKind(game.kind))) return { ok: false, error: notPartOf(featureForGameKind(game.kind)) };
  if (game.kind !== "draw") return { ok: false, error: "Pictures are only for lucky draws." };
  let ext: string;
  try {
    ext = acceptImage({ type: String(type), size: Number(size) });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const imageKind: ImageKind = kind === "prize" ? "game-prize" : "game-card-back";
  try {
    return { ok: true, ...(await createMediaUpload({ orgId: ev.org_id, eventId: ev.id, kind: imageKind, ext })) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * After a rehearsal: everyone this draw picked is back in every draw's pool. The game is
 * looked up in this event first, so a posted id can only ever reset one of its own draws.
 */
export async function resetDrawAction(eventId: string, gameId: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const game = await getGame(gameId, ev.id);
  if (!game || game.kind !== "draw") redirect(flashPath(gamesPath(ev.id), "That draw no longer exists.", "error"));
  await requireFeature(ev.id, featureForGameKind(game.kind), gamesPath(ev.id));
  await resetDraw(game.id);
  const path = `${gamesPath(ev.id)}/${game.id}`;
  revalidatePath(path);
  redirect(flashPath(path, "Draw reset. Everyone it picked is back in the pool."));
}
