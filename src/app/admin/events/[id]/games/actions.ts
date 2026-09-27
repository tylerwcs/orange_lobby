"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent, rotateDisplayToken, rotateHostToken } from "@/lib/db/events";
import { createGame, deleteGame, getGame, resetDraw, updateGame } from "@/lib/db/games";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { GAME_KIND_LABELS, isGameKind } from "@/lib/games/config";
import { configFromForm } from "@/lib/games/config-form";
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
  const title = (String(form.get("title") ?? "").trim() || game.title).slice(0, 80);
  await updateGame(game.id, ev.id, { title, config: parsed.config });
  revalidatePath(path);
  revalidatePath(gamesPath(ev.id));
  redirect(flashPath(path, "Saved."));
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
