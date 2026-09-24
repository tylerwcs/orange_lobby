import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Whether a webhook body really came from Meta.
 *
 * The webhook is a public URL that writes to `whatsapp_sends`; without this, anyone who
 * guessed the path could mark 150 undelivered messages as delivered, which is worse than
 * having no delivery reporting at all — it would be believed.
 *
 * Fails closed on every uncertainty, including an unset `WHATSAPP_APP_SECRET`: a missing
 * secret must shut the endpoint, never open it.
 */
export function verifyMetaSignature(rawBody: string, header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  if (!header || !header.startsWith("sha256=")) return false;
  const provided = Buffer.from(header.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  // timingSafeEqual throws rather than returning false when the lengths differ, so a
  // truncated or junk signature has to be turned away before it gets there.
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
