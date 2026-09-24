import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyMetaSignature } from "@/lib/whatsapp-signature";

const SECRET = "s3cr3t-app-secret";
const BODY = '{"object":"whatsapp_business_account","entry":[]}';
const sign = (body: string, secret: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("verifyMetaSignature", () => {
  it("accepts a body signed with the app secret", () => {
    expect(verifyMetaSignature(BODY, sign(BODY, SECRET), SECRET)).toBe(true);
  });

  it("rejects a body that was altered after signing", () => {
    const tampered = BODY.replace("[]", '[{"id":"evil"}]');
    expect(verifyMetaSignature(tampered, sign(BODY, SECRET), SECRET)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    expect(verifyMetaSignature(BODY, sign(BODY, "wrong-secret"), SECRET)).toBe(false);
  });

  it("fails closed when the header is missing or malformed", () => {
    expect(verifyMetaSignature(BODY, null, SECRET)).toBe(false);
    expect(verifyMetaSignature(BODY, "", SECRET)).toBe(false);
    expect(verifyMetaSignature(BODY, "deadbeef", SECRET)).toBe(false);
    expect(verifyMetaSignature(BODY, "sha1=deadbeef", SECRET)).toBe(false);
  });

  it("fails closed when the app secret is not configured", () => {
    // Otherwise an unset env var would turn the webhook into an open endpoint.
    expect(verifyMetaSignature(BODY, sign(BODY, SECRET), undefined)).toBe(false);
    expect(verifyMetaSignature(BODY, sign(BODY, SECRET), "")).toBe(false);
  });

  it("does not throw on a signature of the wrong length", () => {
    // timingSafeEqual throws on unequal buffers; a short hex string must be a plain false.
    expect(() => verifyMetaSignature(BODY, "sha256=abc123", SECRET)).not.toThrow();
    expect(verifyMetaSignature(BODY, "sha256=abc123", SECRET)).toBe(false);
  });
});
