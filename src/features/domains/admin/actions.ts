"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { flashPath } from "@/lib/flash";
import { domainConfig, ownDomainHost, subdomainHost } from "../hosts";
import { addEventDomain, listEventDomains, makePrimary, removeEventDomain } from "../db";

const back = (eventId: string) => `/admin/events/${eventId}/settings`;
// The proxy remembers an address for up to a minute per server (D429).
const SETTLE = " It can take a minute to take effect.";

async function event(eventId: string) {
  const { orgId } = await requireAdmin();
  return requireEvent(eventId, orgId);
}

async function add(eventId: string, read: { ok: true; host: string } | { ok: false; error: string }) {
  const ev = await event(eventId);
  if (!read.ok) redirect(flashPath(back(eventId), read.error, "error"));
  const added = await addEventDomain(ev, read.host);
  if (!added.ok) redirect(flashPath(back(eventId), added.error, "error"));
  revalidatePath(back(eventId));
  redirect(flashPath(back(eventId), `${read.host} added.${SETTLE}`));
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
  await add(eventId, ownDomainHost(String(fd.get("domain") ?? ""), domainConfig().root));
}

export async function makePrimaryAction(eventId: string, host: string) {
  const ev = await ownAddress(eventId, host);
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
