import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { Form, FormSubmission } from "@/lib/types";

/** `created_at` is excluded too, on top of the brief's Omit (Task 6 brief correction): the row's creation time is the database's to set, never a caller's. */
export type NewForm = Omit<Form, "id" | "org_id" | "event_id" | "created_at">;

/** Every answer `submit_form` can give (D167). Matches `canSubmit`'s vocabulary in src/lib/forms.ts: "today" names the situation, not the mechanism that caught it. */
export type SubmitCode = "ok" | "missing" | "closed" | "ineligible" | "limit" | "today";

export async function listForms(eventId: string): Promise<Form[]> {
  const { data, error } = await serviceClient().from("forms").select("*")
    .eq("event_id", eventId).order("sort_order").order("name");
  if (error) throw error;
  return (data ?? []) as Form[];
}

export async function getForm(id: string, eventId: string): Promise<Form | null> {
  const { data, error } = await serviceClient().from("forms").select("*")
    .eq("id", id).eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  return (data as Form) ?? null;
}

export async function createForm(eventId: string, orgId: string, input: NewForm): Promise<void> {
  const { data: last } = await serviceClient().from("forms").select("sort_order")
    .eq("event_id", eventId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await serviceClient().from("forms")
    .insert({ event_id: eventId, org_id: orgId, ...input, sort_order: (last?.sort_order ?? -1) + 1 });
  if (error) throw error;
}

/**
 * Sends every column including nulls, so clearing a description or a cap actually clears it
 * — the same contract `updateSession` carries, and the same trap: a caller that omits a
 * field is asking for it to be nulled, not left alone.
 *
 * Two statements, no transaction — supabase-js gives us none, and a genuinely atomic version
 * would need its own database function, which is not worth growing this task for. The
 * submissions sync goes first, deliberately, because it is the one write that can actually
 * fail: `per_day` is denormalised onto every submission so the partial unique index can see
 * it without a join (D165), and syncing it can collide with that index if an attendee already
 * has two submissions in one day. The `forms` column update essentially cannot fail. Doing the
 * risky write first means a thrown error leaves both tables exactly as they were before this
 * call — coherent, and retryable once the organiser deletes the offending duplicate — instead
 * of leaving `forms.per_day = true` above submission rows still marked false and invisible to
 * the index. The caller still has to handle the throw; this ordering only makes the failure
 * safe to retry, not impossible.
 */
export async function updateForm(id: string, eventId: string, patch: NewForm): Promise<void> {
  const db = serviceClient();
  const { error: syncError } = await db.from("form_submissions")
    .update({ per_day: patch.per_day }).eq("form_id", id);
  if (syncError) throw syncError;
  const { error } = await db.from("forms").update(patch).eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

export async function deleteForm(id: string, eventId: string): Promise<void> {
  const { error } = await serviceClient().from("forms").delete().eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

export async function listSubmissions(eventId: string): Promise<FormSubmission[]> {
  const { data, error } = await serviceClient().from("form_submissions").select("*")
    .eq("event_id", eventId).order("submitted_on", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FormSubmission[];
}

export async function submissionsForForm(formId: string): Promise<FormSubmission[]> {
  const { data, error } = await serviceClient().from("form_submissions").select("*")
    .eq("form_id", formId).order("submitted_on", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FormSubmission[];
}

export async function submissionsForAttendee(attendeeId: string): Promise<FormSubmission[]> {
  const { data, error } = await serviceClient().from("form_submissions").select("*")
    .eq("attendee_id", attendeeId).order("submitted_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FormSubmission[];
}

/** The only write path. Everything it can refuse is a reason code, never an exception (D167). */
export async function submitForm(
  formId: string, attendeeId: string, answers: Record<string, string>, today: string,
): Promise<SubmitCode> {
  const { data, error } = await serviceClient().rpc("submit_form", {
    p_form_id: formId, p_attendee_id: attendeeId, p_answers: answers, p_today: today,
  });
  if (error) throw error;
  return data as SubmitCode;
}
