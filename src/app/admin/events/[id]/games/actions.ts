"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent, rotateDisplayToken, rotateHostToken } from "@/lib/db/events";
import { createGame, deleteGame, getGame, resetDraw, updateGame } from "@/lib/db/games";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { GAME_KIND_LABELS, isGameKind, parseConfig } from "@/lib/games/config";
import { configFromForm } from "@/lib/games/config-form";
import { backgroundFromForm } from "@/lib/games/background";
import { acceptVideo, isGameVideoFor, mediaPathInEvent } from "@/lib/storage";
import { createVideoUpload, deleteEventImage, nextImage } from "@/lib/db/media";
import { flashPath } from "@/lib/flash";

const gamesPath = (eventId: string) => `/admin/events/${eventId}/games`;

export async function createGameAction(eventId: string, kind: string, form: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  if (!isGameKind(kind)) redirect(flashPath(gamesPath(ev.id), "That kind of game does not exist.", "error"));
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
  const path = `${gamesPath(ev.id)}/${game.id}`;
  const parsed = configFromForm(game.kind, form);
  if (!parsed.ok) redirect(flashPath(path, parsed.error, "error"));
  // A draw's checkpoint must be one of this event's: another event's checkpoint (or a deleted
  // one) has none of this event's check-ins, so the draw would have nobody to draw from.
  if (game.kind === "draw") {
    const checkpointId = (parsed.config as { checkpoint_id: string | null }).checkpoint_id;
    if (checkpointId && !(await listCheckpoints(ev.id)).some((c) => c.id === checkpointId)) {
      redirect(flashPath(path, "That checkpoint is not on this event any more. Pick another and save again.", "error"));
    }
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
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
  await updateGame(game.id, ev.id, { title, config: { ...typedConfig, background: bg.background } });
  // The file this save replaced goes only once the row no longer names it (see nextImage) —
  // and only when it is actually ours to remove: a URL outside this event's folder is left
  // alone rather than handed to the service-role delete.
  if (current.url && current.url !== bg.background.url && mediaPathInEvent(current.url, supabaseUrl, ev.org_id, ev.id)) {
    await deleteEventImage(current.url);
  }
  revalidatePath(path);
  revalidatePath(gamesPath(ev.id));
  redirect(flashPath(path, "Saved."));
}

/** Mints the signed URL a background video uploads to (D300), after checking the game is this event's and the file is one we take. */
export async function backgroundVideoUploadAction(eventId: string, gameId: string, type: string, size: number): Promise<{ ok: true; path: string; token: string; url: string } | { ok: false; error: string }> {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  if (!(await getGame(gameId, ev.id))) return { ok: false, error: "That game no longer exists." };
  let ext: string;
  try {
    ext = acceptVideo({ type: String(type), size: Number(size) });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  try {
    return { ok: true, ...(await createVideoUpload({ orgId: ev.org_id, eventId: ev.id, ext })) };
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
  await resetDraw(game.id);
  const path = `${gamesPath(ev.id)}/${game.id}`;
  revalidatePath(path);
  redirect(flashPath(path, "Draw reset. Everyone it picked is back in the pool."));
}
