import { cronAuthorised } from "@/lib/committee-reminders";
import { runCommitteeReminders } from "@/lib/committee-run";

/**
 * Called every five minutes by pg_cron (migration 0051) with the Vault secret as a bearer
 * token; CRON_SECRET on Vercel is the same value. Anything else is turned away before any work.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cronAuthorised(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await runCommitteeReminders(new Date()));
}
