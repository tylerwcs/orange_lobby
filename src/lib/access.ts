import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { requireAdmin, type AdminContext } from "@/lib/auth";
import { getEvent, requireEvent, listEventsByIds } from "@/lib/db/events";
import { sessionClient } from "@/lib/supabase/session";
import { serviceClient } from "@/lib/supabase/service";
import { decideAccess, type AccessKind, type SeatRow } from "@/lib/access-rules";
import type { Event } from "@/lib/types";

/**
 * D551/D564: the only module that calls `requireAdmin()` or `requireEvent()`.
 * `tests/access-guard.test.ts` fails if anything else does.
 *
 * - `requireEventAccess(id)` for everything inside an event: an Ecopia admin, or a committee member
 *   of that event while it is not archived.
 * - `requireAdminEvent(id)` / `requireOrgAdmin()` for the admin-only list (D553). These are exactly
 *   the old pair, so a call site that was never moved still refuses a committee member: the move
 *   fails closed.
 */
export type Actor = { userId: string; email: string; kind: AccessKind };

const claimsOrLogin = cache(async (): Promise<{ userId: string; email: string }> => {
  const { data } = await (await sessionClient()).auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");
  return { userId: claims.sub, email: claims.email ?? "" };
});

const adminOrgOf = cache(async (userId: string): Promise<string | null> => {
  const { data, error } = await serviceClient().from("org_members").select("org_id").eq("user_id", userId).limit(1).maybeSingle();
  if (error) throw error;
  return (data?.org_id as string | undefined) ?? null;
});

const seatsOf = cache(async (userId: string): Promise<SeatRow[]> => {
  const { data, error } = await serviceClient().from("event_committee")
    .select("event_id, user_id, removed_at").eq("user_id", userId).is("removed_at", null);
  if (error) throw error;
  return (data ?? []) as SeatRow[];
});

/** Ecopia admins only (D553): create event, and the org-wide pages. */
export const requireOrgAdmin = (): Promise<AdminContext> => requireAdmin();

/**
 * The admin layout's gate (D552, D562). An admin, or a committee member with at least one event
 * that is not archived. Anyone else signed in is sent to the login page with `no-access`.
 */
export const requireSignedIn = cache(async () => {
  const { userId, email } = await claimsOrLogin();
  const orgId = await adminOrgOf(userId);
  if (orgId) return { userId, email, kind: "admin" as const, orgId, eventIds: [] as string[] };
  const ids = [...new Set((await seatsOf(userId)).map((s) => s.event_id))];
  const open = (await listEventsByIds(ids)).filter((e) => e.status !== "archived").map((e) => e.id);
  if (open.length === 0) redirect("/login?error=no-access");
  return { userId, email, kind: "committee" as const, orgId: null, eventIds: open };
});

/** Everything inside an event (D551). A refusal is a 404, as `requireEvent` always was. */
export const requireEventAccess = cache(async (eventId: string): Promise<{ actor: Actor; ev: Event }> => {
  const { userId, email } = await claimsOrLogin();
  const ev = await getEvent(eventId);
  if (!ev) notFound();
  // An admin of this event's org is decided by `adminOrgId` alone, so skip the seats query for them.
  const adminOrgId = await adminOrgOf(userId);
  const seats = adminOrgId === ev.org_id ? [] : await seatsOf(userId);
  const kind = decideAccess({ userId, adminOrgId, ev, seats });
  if (!kind) notFound();
  return { actor: { userId, email, kind }, ev };
});

/** The admin-only list inside an event (D553): delete, purge, Features, Address, Committee. */
export const requireAdminEvent = cache(async (eventId: string): Promise<{ actor: Actor; ev: Event }> => {
  const { userId, email, orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  return { actor: { userId, email, kind: "admin" }, ev };
});
