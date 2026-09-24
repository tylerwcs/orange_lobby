import { verifyMetaSignature } from "@/lib/whatsapp-signature";
import { applyStatusByWamid, type WhatsappSendStatus } from "@/lib/db/whatsapp-sends";

/**
 * Meta's delivery reports.
 *
 * A send call answers `accepted`, which only means Meta took the message. Whether it reached a
 * phone arrives here, minutes later, against the `wamid` the send returned. This endpoint is
 * the only reason the organiser can tell "nobody has opened WhatsApp yet" from "eleven numbers
 * in the sheet are wrong" on the morning of the event.
 */
export const dynamic = "force-dynamic";

/** Meta's subscription handshake: echo the challenge, but only to whoever knows the token. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const challenge = params.get("hub.challenge");
  if (
    expected &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === expected &&
    challenge
  ) {
    // Plain text, echoed exactly. Meta rejects the subscription on anything else.
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

const KNOWN: WhatsappSendStatus[] = ["sent", "delivered", "read", "failed"];

type MetaStatus = {
  id?: unknown;
  status?: unknown;
  errors?: { code?: unknown; title?: unknown; message?: unknown }[];
};

export async function POST(request: Request) {
  // Read the body as text, not JSON: the signature covers the exact bytes Meta sent, and
  // re-serialising a parsed object would not reproduce them.
  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    // Signed but unparseable. Retrying will not help, so take it off Meta's queue.
    return new Response("ok", { status: 200 });
  }

  const entries = (body as { entry?: { changes?: { value?: { statuses?: MetaStatus[] } }[] }[] })?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        const wamid = typeof s.id === "string" ? s.id : null;
        const status = typeof s.status === "string" ? (s.status as WhatsappSendStatus) : null;
        if (!wamid || !status || !KNOWN.includes(status)) continue;
        const err = s.errors?.[0];
        await applyStatusByWamid(
          wamid,
          status,
          status === "failed"
            ? {
                code: typeof err?.code === "number" ? err.code : null,
                title: typeof err?.title === "string" ? err.title
                  : typeof err?.message === "string" ? err.message
                  : "Delivery failed",
              }
            : undefined,
        );
      }
    }
  }

  // Always 200 once the signature checks out. A non-200 makes Meta redeliver the whole batch,
  // and a batch this endpoint has already applied does not improve by arriving again.
  //
  // Inbound messages (`value.messages`) are ignored on purpose: nothing here promises a STOP
  // keyword, so there is no reply this app is obliged to act on yet.
  return new Response("ok", { status: 200 });
}
