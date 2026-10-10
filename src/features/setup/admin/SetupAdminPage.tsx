import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { appBaseUrl } from "@/lib/links";
import { shortDateTime } from "@/lib/text";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ShareLink } from "@/components/admin/ShareLink";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSetupRows } from "../db";
import { BUILT_STEPS, setupLink } from "../sections";
import { sectionStatus, STATUS_LABELS, type SectionStatus } from "../status";
import { createSetupLinkAction, replaceSetupLinkAction, turnOffSetupLinkAction } from "./actions";

const TITLES: Record<string, string> = { basics: "Event basics", agenda: "Agenda", info: "Event info and floor plan" };
const STATUS_VARIANT: Record<SectionStatus, "secondary" | "warning" | "success"> = {
  not_started: "secondary", draft: "secondary", submitted: "warning", applied: "success",
};

export async function SetupAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const rows = await listSetupRows(ev.id);
  const url = ev.setup_token ? setupLink(appBaseUrl(), ev.setup_token) : null;

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title="Setup" subtitle="What the organiser sends, waiting for your review before it goes live." />

      <Card>
        <CardHeader>
          <CardTitle>Organiser link</CardTitle>
          <CardDescription>One private link for the organiser&apos;s team: their checklist and the sections they fill in. No login. Nothing they submit changes the event until you apply it.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {url ? (
            <>
              <ShareLink label="Setup" url={url} />
              <div className="flex flex-wrap gap-2">
                <a href={url} target="_blank" rel="noopener" className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-semibold hover:bg-muted">Open as organiser</a>
                <form action={replaceSetupLinkAction.bind(null, ev.id)}>
                  <ConfirmButton message="Replace the setup link? The old one stops working immediately. What the organiser sent is kept.">Replace link</ConfirmButton>
                </form>
                <form action={turnOffSetupLinkAction.bind(null, ev.id)}>
                  <ConfirmButton message="Turn off the setup link? The organiser can't open it until you create a new one. What they sent is kept.">Turn off link</ConfirmButton>
                </form>
              </div>
            </>
          ) : (
            <form action={createSetupLinkAction.bind(null, ev.id)}><SubmitButton>Create setup link</SubmitButton></form>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle>Sections</CardTitle>
          <CardDescription>Open a submitted section to see what would change, then apply it. Agenda and Info arrive in the next release; until then the organiser sees them as checklist cards.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y divide-border border-t border-border">
            {BUILT_STEPS.map((section) => {
              const row = rows.find((r) => r.section === section) ?? null;
              const s = sectionStatus(row);
              return (
                <li key={section}>
                  <Link href={`/admin/events/${ev.id}/setup/${section}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/50">
                    <span className="min-w-0 flex-1 text-sm font-bold">{TITLES[section]}</span>
                    <span className="text-xs text-muted-foreground">{row?.submitted_at ? `Submitted ${shortDateTime(row.submitted_at)}` : "Not submitted"}</span>
                    <span className="text-xs text-muted-foreground">{row?.applied_at ? `Applied ${shortDateTime(row.applied_at)}` : ""}</span>
                    <Badge variant={STATUS_VARIANT[s]}>{STATUS_LABELS[s]}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
