import "server-only";
import { redirect } from "next/navigation";
import { sessionClient } from "@/lib/supabase/session";
import { serviceClient } from "@/lib/supabase/service";

export type AdminContext = { userId: string; orgId: string; email: string };

export async function requireAdmin(): Promise<AdminContext> {
  const supabase = await sessionClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: member } = await serviceClient()
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!member) redirect("/login?error=not-a-member");
  return { userId: user.id, orgId: member.org_id, email: user.email ?? "" };
}
