import { createClient } from "@supabase/supabase-js";

/**
 * Host → event for the proxy (D425, D429), memoised per server instance for a minute - the games
 * pattern (D259), so a busy event costs about one read per host per minute. No `server-only`
 * marker (D431): the proxy imports it, and the service key it reads is never in a browser bundle.
 */
export type HostEvent = { slug: string; isPrimary: boolean; primaryDomain: string | null };

const TTL_MS = 60_000;
const memo = new Map<string, { at: number; value: HostEvent | null }>();

export async function lookupHost(host: string, now = Date.now()): Promise<HostEvent | null> {
  const hit = memo.get(host);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.from("event_domains").select("domain, is_primary, event_id, events(slug)").eq("domain", host).maybeSingle();
  if (error) throw error;
  let value: HostEvent | null = null;
  if (data) {
    const slug = (data.events as unknown as { slug: string } | null)?.slug;
    let primaryDomain: string | null = data.is_primary ? host : null;
    if (!data.is_primary) {
      const { data: p } = await db.from("event_domains").select("domain").eq("event_id", data.event_id).eq("is_primary", true).maybeSingle();
      primaryDomain = (p?.domain as string | undefined) ?? null;
    }
    // An address whose event has no primary (only mid-change) serves the event itself.
    if (slug) value = { slug, isPrimary: data.is_primary || primaryDomain === null, primaryDomain };
  }
  // Unknown hosts are cached too (the wildcard lets anyone invent one), so cap the map.
  if (memo.size >= 1000) memo.clear();
  memo.set(host, { at: now, value });
  return value;
}
