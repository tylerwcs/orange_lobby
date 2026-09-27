import { createClient } from "@supabase/supabase-js";

/**
 * An anon client for one job: uploading to a signed URL the server minted (D300). The bucket has
 * no write policy, so without that URL this client can put nothing in it.
 */
export function browserStorage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
