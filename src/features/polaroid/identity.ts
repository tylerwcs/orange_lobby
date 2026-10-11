import "server-only";
import { cookies, headers } from "next/headers";
import { createHash, createHmac, randomUUID } from "node:crypto";

const COOKIE = "ecp_polaroid";
const ID = /^[0-9a-f-]{36}$/;

/**
 * D480: the rate limit's two keys. `clientKey` is the sha-256 of a random id this device keeps in a
 * cookie; `ipHash` is an HMAC of the request's IP, keyed with a server secret so the stored value
 * cannot be reversed by trying every address. Neither identifies anyone.
 *
 * Sets a cookie, so it is only ever called from a Server Action or Route Handler.
 */
export async function posterKeys(): Promise<{ clientKey: string; ipHash: string }> {
  const jar = await cookies();
  let id = jar.get(COOKIE)?.value;
  if (!id || !ID.test(id)) {
    id = randomUUID();
    jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/" });
  }
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "polaroid";
  return {
    clientKey: createHash("sha256").update(id).digest("hex"),
    ipHash: createHmac("sha256", secret).update(ip).digest("hex"),
  };
}
