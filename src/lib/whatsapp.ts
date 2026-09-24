/**
 * The WhatsApp Cloud API, as much of it as this app uses: build a template message, hand it
 * to Meta, report what Meta said.
 *
 * Not marked `server-only`, unlike the other modules that read secrets, because
 * `templatePayload` is pure and is unit tested. `WHATSAPP_ACCESS_TOKEN` carries no
 * NEXT_PUBLIC_ prefix, so Next will not inline it into a client bundle even if this module is
 * imported from one; the token is read inside the call, never at module scope.
 */
const GRAPH = "https://graph.facebook.com/v25.0";

export type TemplateParam = { type: "text"; text: string };
export type TemplateComponent =
  | { type: "body"; parameters: TemplateParam[] }
  | { type: "button"; sub_type: "url"; index: string; parameters: TemplateParam[] };

export type TemplatePayload = {
  messaging_product: "whatsapp";
  to: string;
  type: "template";
  template: { name: string; language: { code: string }; components: TemplateComponent[] };
};

export type TemplateInput = {
  to: string;
  template: string;
  bodyParams: string[];
  /**
   * The dynamic URL button's variable — the attendee's token ALONE, never a whole link. Meta
   * stores the prefix with the approved template and appends this to it, so passing a URL
   * here produces https://host/a/https://host/a/<token>. The rejected first draft of
   * `ecphub_uniqueportal` failed on exactly this shape.
   */
  buttonParam?: string;
  /** The approved templates are filed under plain `en`, not `en_US`. A mismatch is a 132001. */
  language?: string;
};

const text = (t: string): TemplateParam => ({ type: "text", text: t });

export function templatePayload({ to, template, bodyParams, buttonParam, language = "en" }: TemplateInput): TemplatePayload {
  const components: TemplateComponent[] = [];
  // An empty `parameters` array is rejected, so a template with no variables sends no body
  // component at all rather than an empty one.
  if (bodyParams.length > 0) components.push({ type: "body", parameters: bodyParams.map(text) });
  // `index` is the button's position as a string, which is what the API wants — "0", not 0.
  if (buttonParam) components.push({ type: "button", sub_type: "url", index: "0", parameters: [text(buttonParam)] });
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: { name: template, language: { code: language }, components },
  };
}

export type SendResult =
  | { ok: true; wamid: string }
  | { ok: false; code: number | null; title: string };

/**
 * Accepted is not delivered. A `wamid` here means Meta took the message; whether it reached a
 * phone arrives later on the webhook, against that same id. Never throws — a blast of 150 must
 * carry on past one bad number, and the caller records each answer either way.
 */
export async function sendTemplate(input: TemplateInput): Promise<SendResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) {
    return { ok: false, code: null, title: "WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN is not set" };
  }
  try {
    const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(templatePayload(input)),
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    const wamid = json?.messages?.[0]?.id;
    if (res.ok && typeof wamid === "string") return { ok: true, wamid };
    return { ok: false, code: json?.error?.code ?? null, title: json?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    // A network failure is the one case with no answer from Meta at all; it must still land in
    // the log as a failed row rather than stopping the run.
    return { ok: false, code: null, title: e instanceof Error ? e.message : "Network error" };
  }
}
