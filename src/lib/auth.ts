import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { sessionClient } from "@/lib/supabase/session";
import { serviceClient } from "@/lib/supabase/service";

export type AdminContext = { userId: string; orgId: string; email: string };

/**
 * Memoised per request: the admin layout, the event layout and the page below them all call
 * this, and each call used to be its own auth round trip plus an `org_members` query.
 *
 * `getClaims()` rather than `getUser()`: this project signs its JWTs with an asymmetric key,
 * so the token is verified locally against the cached JWKS instead of asking the Auth server.
 * The one thing that gives up is noticing a deleted or banned user before their token expires
 * (an hour at most) - and a user removed from `org_members` below is still refused at once.
 */
export const requireAdmin = cache(async (): Promise<AdminContext> => {
  const supabase = await sessionClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");
  const { data: member } = await serviceClient()
    .from("org_members")
    .select("org_id")
    .eq("user_id", claims.sub)
    .limit(1)
    .maybeSingle();
  if (!member) redirect("/login?error=not-a-member");
  return { userId: claims.sub, orgId: member.org_id, email: claims.email ?? "" };
});
