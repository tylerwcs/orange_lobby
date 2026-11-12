"use server";
import { headers } from "next/headers";
import { getEventBySlug } from "@/lib/db/events";
import { allow } from "@/lib/ratelimit";
import { cleanSource } from "./client";
import { recordLinkHit } from "./db";

/**
 * D899: the registration page's visit, sent once per tab by VisitBeacon. Only a live event counts:
 * a draft's visitors are the team previewing it. A failure is logged and swallowed - counting a
 * visit must never trouble the person registering.
 */
export async function recordVisitAction(slug: string, rawSource: string): Promise<void> {
  const source = cleanSource(rawSource);
  if (!source) return;
  try {
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!allow(`visit:${slug}:${ip}`, 20, 60_000)) return;
    const event = await getEventBySlug(slug);
    if (!event || event.status !== "live") return;
    await recordLinkHit(event.id, source, "visit");
  } catch (e) {
    console.error("recordVisitAction failed", e);
  }
}
