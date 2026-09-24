import "server-only";
import { serviceClient } from "@/lib/supabase/service";

export type WhatsappSendStatus = "queued" | "accepted" | "sent" | "delivered" | "read" | "failed";

export type WhatsappSend = {
  id: string;
  org_id: string;
  event_id: string;
  attendee_id: string;
  template: string;
  to_e164: string;
  wamid: string | null;
  status: WhatsappSendStatus;
  error_code: number | null;
  error_title: string | null;
  dedupe_key: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Claims the right to send, before sending.
 *
 * The row goes in first and the message goes out second, so a run that dies halfway — a
 * deploy, a closed laptop, a timeout — leaves claimed rows behind rather than silent gaps.
 * Re-running then skips everyone already claimed instead of messaging them twice, which is
 * the whole reason `dedupe_key` is UNIQUE.
 *
 * Returns null when the key is already taken. That is the ordinary outcome on a retry, not an
 * error: it means this attendee has already had this message.
 */
export async function claimSend(input: {
  orgId: string;
  eventId: string;
  attendeeId: string;
  template: string;
  toE164: string;
  dedupeKey: string | null;
}): Promise<WhatsappSend | null> {
  const row = {
    org_id: input.orgId,
    event_id: input.eventId,
    attendee_id: input.attendeeId,
    template: input.template,
    to_e164: input.toE164,
    dedupe_key: input.dedupeKey,
    status: "queued" as const,
  };
  // A null dedupe_key cannot collide — Postgres lets nulls repeat under a unique constraint —
  // so a day-of notice takes the plain insert path and may go out as often as asked.
  if (!input.dedupeKey) {
    const { data } = await serviceClient().from("whatsapp_sends").insert(row).select().maybeSingle();
    return (data as WhatsappSend) ?? null;
  }
  const { data } = await serviceClient()
    .from("whatsapp_sends")
    .upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select()
    .maybeSingle();
  return (data as WhatsappSend) ?? null;
}

/** Meta took the message. Not delivered — that answer arrives on the webhook. */
export async function markAccepted(id: string, wamid: string): Promise<void> {
  await serviceClient()
    .from("whatsapp_sends")
    .update({ wamid, status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function markFailed(id: string, code: number | null, title: string): Promise<void> {
  await serviceClient()
    .from("whatsapp_sends")
    .update({ status: "failed", error_code: code, error_title: title, updated_at: new Date().toISOString() })
    .eq("id", id);
}

/**
 * The webhook's write. Found by `wamid` because that is the only handle Meta carries back.
 *
 * `failed` is sticky: Meta can report `sent` and then `failed` for one message, and the
 * failure is the answer that matters to whoever is reading the list at the registration desk.
 */
export async function applyStatusByWamid(
  wamid: string,
  status: WhatsappSendStatus,
  error?: { code: number | null; title: string },
): Promise<void> {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (error) {
    patch.error_code = error.code;
    patch.error_title = error.title;
  }
  const q = serviceClient().from("whatsapp_sends").update(patch).eq("wamid", wamid);
  if (status !== "failed") await q.neq("status", "failed");
  else await q;
}

export async function listSends(eventId: string): Promise<WhatsappSend[]> {
  const { data } = await serviceClient()
    .from("whatsapp_sends")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  return (data as WhatsappSend[]) ?? [];
}

/** Attendees who already hold this template's message, so the dry run can say so up front. */
export async function alreadySentTo(eventId: string, template: string): Promise<Set<string>> {
  const { data } = await serviceClient()
    .from("whatsapp_sends")
    .select("attendee_id")
    .eq("event_id", eventId)
    .eq("template", template)
    .neq("status", "failed");
  return new Set(((data as { attendee_id: string }[]) ?? []).map((r) => r.attendee_id));
}
