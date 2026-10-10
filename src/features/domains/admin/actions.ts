"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { flashPath } from "@/lib/flash";
import { domainConfig, isSubdomainOf, ownDomainHost, subdomainHost } from "../hosts";
import { vercelDomainStatus } from "../vercel";
import { addEventDomain, listEventDomains, makePrimary, removeEventDomain } from "../db";

const back = (eventId: string) => `/admin/events/${eventId}/settings`;
// The proxy remembers an address for up to a minute per server (D429).
const SETTLE = " It can take a minute to take effect.";

async function event(eventId: string) {
  const { orgId } = await requireAdmin();
  return requireEvent(eventId, orgId);
}

async function add(eventId: string, read: { ok: true; host: string } | { ok: false; error: string }, own = false) {
  const ev = await event(eventId);
  if (!read.ok) redirect(flashPath(back(eventId), read.error, "error"));
  // An own domain that isn't live on Vercel must not become primary: links would point at a dead address.
  // "unknown" (no Vercel env vars, or unreachable) can't be told, so it is allowed.
  const status = own ? await vercelDomainStatus(read.host) : "live";
  const notLive = status === "not-added" || status === "unverified";
  const added = await addEventDomain(ev, read.host, { mayBePrimary: !notLive });
  if (!added.ok) redirect(flashPath(back(eventId), added.error, "error"));
  revalidatePath(back(eventId));
  const message = notLive
    ? `${read.host} saved. It isn't live on Vercel yet, so links keep their current address. Make it primary once it shows Live.`
    : `${read.host} added.${SETTLE}`;
  redirect(flashPath(back(eventId), message));
}

/** A crafted post must not touch another event's address, or clear this event's primary. */
async function ownAddress(eventId: string, host: string) {
  const ev = await event(eventId);
  const mine = await listEventDomains(ev.id);
  if (!mine.some((d) => d.domain === host)) redirect(flashPath(back(eventId), "That address isn't on this event.", "error"));
  return ev;
}

export async function addSubdomainAction(eventId: string, fd: FormData) {
  await add(eventId, subdomainHost(String(fd.get("label") ?? ""), domainConfig().root));
}

export async function addOwnDomainAction(eventId: string, fd: FormData) {
  await add(eventId, ownDomainHost(String(fd.get("domain") ?? ""), domainConfig().root), true);
}

export async function makePrimaryAction(eventId: string, host: string) {
  const ev = await ownAddress(eventId, host);
  if (!isSubdomainOf(host, domainConfig().root)) {
    const status = await vercelDomainStatus(host);
    if (status === "not-added" || status === "unverified") redirect(flashPath(back(eventId), `${host} isn't live on Vercel yet, so it can't be primary.`, "error"));
  }
  await makePrimary(ev.id, host);
  revalidatePath(back(eventId));
  redirect(flashPath(back(eventId), `Links now use ${host}.${SETTLE}`));
}

export async function removeDomainAction(eventId: string, host: string) {
  const ev = await ownAddress(eventId, host);
  await removeEventDomain(ev.id, host);
  revalidatePath(back(eventId));
  redirect(flashPath(back(eventId), `${host} removed.${SETTLE}`));
}
