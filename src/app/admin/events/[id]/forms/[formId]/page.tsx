import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { getForm, submissionsForForm } from "@/lib/db/forms";
import { listAttendees } from "@/lib/db/attendees";
import { capSummary } from "@/lib/forms";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SubmissionTable } from "@/components/admin/SubmissionTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Form · Orange Lobby" };

export default async function FormDetail({ params }: { params: Promise<{ id: string; formId: string }> }) {
  const { id, formId } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const form = await getForm(formId, ev.id);
  if (!form) notFound();

  const [submissions, attendees] = await Promise.all([submissionsForForm(form.id), listAttendees(ev.id)]);
  const attendeeById = new Map(attendees.map((a) => [a.id, a]));
  const submitterFor = (attendeeId: string) => {
    const a = attendeeById.get(attendeeId);
    return { name: a?.name ?? "Unknown", email: a?.email ?? null, category: a?.category ?? null };
  };

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title={form.name}
        subtitle={`${submissions.length} submission${submissions.length === 1 ? "" : "s"}`}
        actions={
          <>
            <Badge variant={form.submissions_open ? "default" : "outline"}>{form.submissions_open ? "Open" : "Closed"}</Badge>
            <Badge variant="secondary">{capSummary(form)}</Badge>
            {/* Whole-event export (no `ids` param), same as the Exports page's own link — a
                download from here is the same file, just reached from the form it is about. */}
            <a download href={`/admin/events/${ev.id}/export/forms.xlsx`} className={buttonVariants({ variant: "outline" })}>
              <Icon name="file" size={18} />Export all forms
            </a>
          </>
        }
      />

      <Card className="overflow-hidden">
        <CardHeader className="border-b"><CardTitle>Submissions</CardTitle></CardHeader>
        <CardContent className="px-0">
          <SubmissionTable submissions={submissions} questions={form.questions} submitterFor={submitterFor} />
        </CardContent>
      </Card>
    </div>
  );
}
