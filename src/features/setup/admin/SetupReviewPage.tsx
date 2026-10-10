import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { shortDateTime } from "@/lib/text";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSetupRow } from "../db";
import { isBuiltStep } from "../sections";
import { hasUnsubmittedChanges, sectionStatus, STATUS_LABELS } from "../status";
import { basicsBaseline, basicsChanges, basicsErrors, basicsFromEvent, basicsMissing, sanitizeBasics } from "../sections/basics";
import { HomePreview } from "../preview/HomePreview";
import { applySectionAction } from "./actions";

/** What Apply would change on the live event, next to the preview the organiser saw (D449). */
export async function SetupReviewPage({ params }: { params: Promise<{ id: string; section: string }> }) {
  const { id, section } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  if (!isBuiltStep(section)) notFound();
  const row = await getSetupRow(ev.id, section);
  const status = sectionStatus(row);
  const back = `/admin/events/${ev.id}/setup`;

  if (!row?.submitted) {
    return (
      <div className="flex flex-col gap-4">
        <AdminHeader title="Event basics" subtitle="Nothing submitted yet." />
        <Link href={back} className="text-sm font-bold text-primary">‹ Setup</Link>
      </div>
    );
  }

  const submitted = sanitizeBasics(row.submitted);
  const changes = basicsChanges(submitted, basicsFromEvent(ev), basicsBaseline(row, ev));
  const problems = basicsMissing(submitted).length + Object.keys(basicsErrors(submitted)).length;
  const canApply = status === "submitted" && problems === 0;

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title="Event basics"
        subtitle={`Submitted ${row.submitted_at ? shortDateTime(row.submitted_at) : ""}${row.applied_at ? ` · last applied ${shortDateTime(row.applied_at)}` : ""}`}
        actions={
          canApply ? (
            // Bound to the version on screen: Apply refuses if the organiser has submitted since.
            <form action={applySectionAction.bind(null, ev.id, section, row.submitted_at ?? "")}>
              <SubmitButton>Apply to event</SubmitButton>
            </form>
          ) : (
            // SubmitButton does not forward `disabled` (it owns it for the pending state), so a plain Button.
            <Button disabled>Apply to event</Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={back} className="text-sm font-bold text-primary">‹ Setup</Link>
        <Badge variant={status === "applied" ? "success" : "warning"}>{STATUS_LABELS[status]}</Badge>
        {hasUnsubmittedChanges(row) && <span className="text-xs text-muted-foreground">The organiser is editing again; you see their last submitted version.</span>}
        {problems > 0 && <span className="text-xs font-semibold text-destructive">This version has problems the organiser needs to fix before it can be applied.</span>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden pb-0">
          <CardHeader>
            <CardTitle>What would change</CardTitle>
            <CardDescription>Lists only what the organiser changed and what differs from the live event. Apply writes just these fields, so your own edits in Settings stay unless the organiser changed that field again.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {changes.length === 0 ? (
              <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">{row.applied ? "Nothing new since the last Apply." : "Matches the live event."}</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {changes.map((c) => (
                  <li key={c.field} className="flex flex-col gap-1 px-4 py-3">
                    <span className="text-sm font-bold">{c.label}{c.infoOnly && <span className="ml-2 text-xs font-normal text-muted-foreground">For your notes, not written to the event</span>}</span>
                    {c.image ? (
                      <span className="flex items-center gap-3 text-xs text-muted-foreground">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {c.before ? <img src={c.before} alt="Current" className="h-14 rounded border border-border object-contain" /> : <span>None</span>}
                        →
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {c.after ? <img src={c.after} alt="Submitted" className="h-14 rounded border border-border object-contain" /> : <span>Removed</span>}
                      </span>
                    ) : (
                      <span className="whitespace-pre-line text-sm">
                        {!c.infoOnly && <span className="text-muted-foreground line-through">{c.before || "empty"}</span>}
                        {!c.infoOnly && " → "}
                        {c.after || <span className="text-muted-foreground">empty</span>}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <aside className="flex flex-col gap-2">
          <p className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">As submitted</p>
          <HomePreview basics={submitted} compact />
        </aside>
      </div>
    </div>
  );
}
