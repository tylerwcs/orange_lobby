"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { flashPath } from "@/lib/flash";
import { portalSquadContext } from "./context";
import { addSquadMember, listSports, removeSquadMember } from "./db/tournaments";
import { refusalFlash } from "./lib/squads";

/**
 * The portal's squad writes (D644, D645): a picker adds or removes anyone in their group; under
 * Members join themselves anyone joins or leaves. The page only offers what the context allows;
 * the squad functions decide (D642), and their answer is the flash.
 */

const pagePath = (slug: string, token: string, activityId: string) => `/e/${slug}/a/${token}/activities/${activityId}`;

async function write(kind: "add" | "remove", slug: string, token: string, activityId: string, sportId: string, attendeeId: string) {
  const back = pagePath(slug, token, activityId);
  const ctx = await portalSquadContext(slug, token, activityId);
  if (!ctx) redirect(flashPath(back, refusalFlash("closed", { sport: "" }), "error"));
  const sport = (await listSports(activityId)).find((s) => s.id === sportId);
  if (!sport) redirect(flashPath(back, refusalFlash("missing", { sport: "" }), "error"));
  const self = attendeeId === ctx.attendee.id;
  const name = self ? "You" : ctx.members.find((m) => m.id === attendeeId)?.name ?? "They";
  const run = kind === "add" ? addSquadMember : removeSquadMember;
  const r = await run({ sportId: sport.id, attendeeId, actorId: ctx.attendee.id, admin: false });
  if (r !== "ok") redirect(flashPath(back, refusalFlash(r, { sport: sport.name, name: self ? undefined : name }), "error"));
  revalidatePath(back);
  const message = kind === "add"
    ? (self ? `You're in ${sport.name}.` : `${name} added to ${sport.name}.`)
    : (self ? `You've left ${sport.name}.` : `${name} removed from ${sport.name}.`);
  redirect(flashPath(back, message));
}

/** Pick a member for a sport - or join it yourself, when `attendeeId` is your own. */
export async function pickSquadMemberAction(slug: string, token: string, activityId: string, sportId: string, attendeeId: string) {
  await write("add", slug, token, activityId, sportId, attendeeId);
}

/** Take someone out of a sport - or leave it yourself, when `attendeeId` is your own. */
export async function removeSquadMemberAction(slug: string, token: string, activityId: string, sportId: string, attendeeId: string) {
  await write("remove", slug, token, activityId, sportId, attendeeId);
}
