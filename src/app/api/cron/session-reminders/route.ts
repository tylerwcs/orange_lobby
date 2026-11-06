import { cronAuthorised } from "@/lib/committee-reminders";
import { runSessionReminders } from "@/features/activities";

/**
 * D836: called every minute by pg_cron (migration 0127) with the same Vault secret as the
 * committee reminders; CRON_SECRET on Vercel is that value. Anything else is turned away.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cronAuthorised(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await runSessionReminders(new Date()));
}
