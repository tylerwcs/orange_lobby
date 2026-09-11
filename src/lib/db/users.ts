import "server-only";
import { serviceClient } from "@/lib/supabase/service";

/**
 * Crew account ids resolved to something a human recognises, for "who scanned this".
 * Supabase has no bulk lookup for auth users, so this is one call per distinct scanner —
 * fine at the two or three crew accounts an event runs, and callers pass a de-duplicated
 * list. An id that cannot be resolved is simply absent, and callers fall back to the id.
 */
export async function scannerNames(ids: (string | null)[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  const out: Record<string, string> = {};
  for (const id of unique) {
    const { data } = await serviceClient().auth.admin.getUserById(id);
    if (data.user?.email) out[id] = data.user.email;
  }
  return out;
}

/** The part of a crew email before the @, which is what fits beside a check-in time. */
export function shortScanner(email: string): string {
  return email.split("@")[0] || email;
}
