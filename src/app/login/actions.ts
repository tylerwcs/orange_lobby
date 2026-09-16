"use server";
import { redirect } from "next/navigation";
import { sessionClient } from "@/lib/supabase/session";
import { safeNextPath } from "@/lib/safe-redirect";
import { classifyLoginError } from "@/lib/login-errors";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");
  const supabase = await sessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // A code, never Supabase's sentence: whatever lands in `?error=` is rendered on the one
  // page that asks for a password, so it must not be able to carry text.
  if (error) redirect(`/login?error=${classifyLoginError(error.message)}&next=${encodeURIComponent(next)}`);
  redirect(safeNextPath(next));
}

export async function signOut() {
  const supabase = await sessionClient();
  await supabase.auth.signOut();
  redirect("/login");
}
