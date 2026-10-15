"use server";
import { redirect } from "next/navigation";
import { getEvent } from "@/lib/db/events";
import { allow } from "@/lib/ratelimit";
import { sessionClient } from "@/lib/supabase/session";
import { serviceClient } from "@/lib/supabase/service";
import { linkIsLive, passwordProblem } from "../lib/rules";
import { memberByToken, acceptMember, clearLink, userIdByEmail, isOrgAdmin } from "../db";

/**
 * D559-D561: the token is the only authority. A Server Action is a public POST, so every call
 * re-reads the row and the event from the token. Any refusal that is about the link itself goes
 * back to the page with no error code, which shows the one dead-link message.
 */
export async function joinAction(token: string, fd: FormData) {
  const page = `/join/${token}`;
  if (!allow(`join-submit:${token}`, 10, 60_000)) redirect(`${page}?error=busy`);
  const m = await memberByToken(token);
  const ev = m ? await getEvent(m.event_id) : null;
  if (!m || !ev || ev.status === "archived" || !linkIsLive(m, new Date())) redirect(page);

  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  const existing = await userIdByEmail(m.email);
  if (existing && await isOrgAdmin(existing)) redirect(page); // D554
  const auth = serviceClient().auth.admin;

  if (m.link_kind === "reset") {
    // D560: a new password for an existing login.
    const problem = passwordProblem(password, confirm);
    if (problem) redirect(`${page}?error=${problem}`);
    if (!m.user_id) redirect(page);
    const { error } = await auth.updateUserById(m.user_id, { password });
    if (error) redirect(`${page}?error=rejected`);
    await clearLink(m.id);
  } else if (existing) {
    // D555/D559: they already have a login; their current password proves it is them.
    const { error } = await (await sessionClient()).auth.signInWithPassword({ email: m.email, password });
    if (error) redirect(`${page}?error=wrong`);
    await acceptMember(m.id, existing);
    redirect(`/admin/events/${m.event_id}`);
  } else {
    const problem = passwordProblem(password, confirm);
    if (problem) redirect(`${page}?error=${problem}`);
    const { data, error } = await auth.createUser({ email: m.email, password, email_confirm: true });
    if (error || !data.user) redirect(`${page}?error=rejected`);
    await acceptMember(m.id, data.user.id);
  }
  // D561: the same sign-in as /login, so the cookies are set the same way.
  await (await sessionClient()).auth.signInWithPassword({ email: m.email, password });
  redirect(`/admin/events/${m.event_id}`);
}
