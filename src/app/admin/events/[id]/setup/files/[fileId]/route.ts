import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { getSetupFile, setupFileUrl } from "@/features/setup";

/** One file the organiser sent, for an admin of its event: a redirect to a one-minute link carrying its name (D459). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const f = await getSetupFile(ev.id, fileId);
  const url = f ? await setupFileUrl(f) : null;
  if (!url) return new NextResponse("That file is no longer available.", { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
