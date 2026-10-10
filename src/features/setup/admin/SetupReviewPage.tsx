import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { shortDateTime } from "@/lib/text";
import type { Event } from "@/lib/types";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSetupRow, type SetupRow } from "../db";
import { isBuiltStep, SECTION_TITLES, type SetupSection } from "../sections";
import { hasUnsubmittedChanges, sectionStatus, STATUS_LABELS } from "../status";
import { basicsBaseline, basicsChanges, basicsFromEvent, basicsProblems, sanitizeBasics } from "../sections/basics";
import { HomePreview } from "../preview/HomePreview";
import { AgendaPreview } from "../preview/AgendaPreview";
import { agendaReview, previewIds } from "./plans";
import { BasicsChanges } from "./BasicsChanges";
import { PlanChanges } from "./PlanChanges";
import { applySectionAction } from "./actions";

type Review = { problems: string[]; description: string; body: React.ReactNode; preview: React.ReactNode };

const ONLY_CHANGES = "Lists only what the organiser changed that differs from the live event. Apply writes just these, so your own edits stay unless the organiser changed the same thing again.";

/** Each section's review: its problems, what would change, and the preview the organiser saw (D449). */
async function reviewFor(section: SetupSection, ev: Event, row: SetupRow): Promise<Review> {
  switch (section) {
    case "basics": {
      const submitted = sanitizeBasics(row.submitted);
      return {
        problems: basicsProblems(submitted),
        description: ONLY_CHANGES,
        body: <BasicsChanges changes={basicsChanges(submitted, basicsFromEvent(ev), basicsBaseline(row, ev))} applied={Boolean(row.applied)} />,
        preview: <HomePreview basics={submitted} compact />,
      };
    }
    case "agenda": {
      const r = await agendaReview(ev, row, previewIds());
      return {
        problems: r.problems,
        description: `${ONLY_CHANGES} New and retimed sessions go in by time; everything else keeps its order. Breakout rounds, image rows, photos and audiences are never touched.`,
        body: <PlanChanges changes={r.plan.changes} empty={row.applied ? "Nothing new since the last Apply." : "Matches the live agenda."} />,
        preview: <AgendaPreview agenda={r.submitted} primaryColor={ev.primary_color} compact />,
      };
    }
    default: { const never: never = section; return never; }
  }
}

/** What Apply would change on the live event, next to the preview the organiser saw (D449). */
export async function SetupReviewPage({ params }: { params: Promise<{ id: string; section: string }> }) {
  const { id, section } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  if (!isBuiltStep(section)) notFound();
  const row = await getSetupRow(ev.id, section);
  const status = sectionStatus(row);
  const back = `/admin/events/${ev.id}/setup`;
  const title = SECTION_TITLES[section];

  if (!row?.submitted) {
    return (
      <div className="flex flex-col gap-4">
        <AdminHeader title={title} subtitle="Nothing submitted yet." />
        <Link href={back} className="text-sm font-bold text-primary">‹ Setup</Link>
      </div>
    );
  }

  const review = await reviewFor(section, ev, row);
  const canApply = status === "submitted" && review.problems.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title={title}
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
      </div>
      {review.problems.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Can&apos;t be applied yet</CardTitle>
            <CardDescription>Ask the organiser to fix these, or fix the event in admin first.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 text-sm">{review.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden pb-0">
          <CardHeader>
            <CardTitle>What would change</CardTitle>
            <CardDescription>{review.description}</CardDescription>
          </CardHeader>
          <CardContent className="px-0">{review.body}</CardContent>
        </Card>
        <aside className="flex flex-col gap-2">
          <p className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">As submitted</p>
          {review.preview}
        </aside>
      </div>
    </div>
  );
}
