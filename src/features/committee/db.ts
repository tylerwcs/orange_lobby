import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { generateToken, isValidToken } from "@/lib/tokens";
import type { CommitteeMember } from "./types";
import { linkExpiry } from "./lib/rules";

const table = () => serviceClient().from("event_committee");

/** D563: the active members, oldest first. Removed rows stay in the table, not in the list. */
export async function listMembers(eventId: string): Promise<CommitteeMember[]> {
  const { data, error } = await table().select("*").eq("event_id", eventId).is("removed_at", null).order("added_at");
  if (error) throw error;
  return (data ?? []) as CommitteeMember[];
}

/** D559: a new member comes with their set-up link. "duplicate" when they are already on it. */
export async function addMember(eventId: string, name: string, email: string, addedBy: string): Promise<CommitteeMember | "duplicate"> {
  const { data, error } = await table().insert({
    event_id: eventId, name, email, added_by: addedBy,
    link_token: generateToken(), link_kind: "setup", link_expires_at: linkExpiry(new Date()),
  }).select("*").single();
  if (error?.code === "23505") return "duplicate";
  if (error) throw error;
  return data as CommitteeMember;
}

/**
 * D558-D560: a fresh link overwrites the old one, which stops it. A reset link needs a login to
 * reset, so it is refused for someone who never finished setting up.
 */
export async function issueLink(eventId: string, id: string, kind: "setup" | "reset"): Promise<boolean> {
  const patch = { link_token: generateToken(), link_kind: kind, link_expires_at: linkExpiry(new Date()) };
  const base = table().update(patch).eq("id", id).eq("event_id", eventId).is("removed_at", null);
  const { data, error } = await (kind === "reset" ? base.not("user_id", "is", null) : base.is("accepted_at", null)).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** D559: stamped, not deleted; any unused link dies with it. */
export async function removeMember(eventId: string, id: string): Promise<boolean> {
  const { data, error } = await table().update({ removed_at: new Date().toISOString(), link_token: null, link_kind: null, link_expires_at: null })
    .eq("id", id).eq("event_id", eventId).is("removed_at", null).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** The row a /join link belongs to. Liveness is the caller's check (`linkIsLive`). */
export async function memberByToken(token: string): Promise<CommitteeMember | null> {
  if (!isValidToken(token)) return null;
  const { data, error } = await table().select("*").eq("link_token", token).maybeSingle();
  if (error) throw error;
  return (data as CommitteeMember | null) ?? null;
}

/**
 * D559: the set-up link was used. The link is spent. Conditional on the token still being the
 * row's current one, so a submit that read the row before an admin replaced or removed the link,
 * or a second submit of the same link, claims nothing. False means the link was not ours to spend.
 */
export async function acceptMember(id: string, token: string, userId: string): Promise<boolean> {
  const { data, error } = await table()
    .update({ user_id: userId, accepted_at: new Date().toISOString(), link_token: null, link_kind: null, link_expires_at: null })
    .eq("id", id).eq("link_token", token).is("removed_at", null).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * D560: a reset link was used. Only the link changes. It is the claim made before the password is
 * set, and is conditional on the token like `acceptMember`: false means somebody else got there first.
 */
export async function clearLink(id: string, token: string): Promise<boolean> {
  const { data, error } = await table()
    .update({ link_token: null, link_kind: null, link_expires_at: null })
    .eq("id", id).eq("link_token", token).is("removed_at", null).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function userIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await serviceClient().rpc("auth_user_id_by_email", { p_email: email });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** D554: nobody is both an Ecopia admin and committee. */
export async function isOrgAdmin(userId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("org_members").select("user_id").eq("user_id", userId).limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
