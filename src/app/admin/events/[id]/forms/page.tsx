import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listForms, listSubmissions } from "@/lib/db/forms";
import { capSummary, MAX_FORM_QUESTIONS } from "@/lib/forms";
import { FORM_QUESTION_TYPES } from "@/lib/registration";
import type { Form } from "@/lib/types";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { QuestionEditor } from "@/components/admin/QuestionEditor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { addFormAction, saveFormAction, deleteFormAction, toggleFormOpenAction } from "./actions";

export const metadata = { title: "Forms · Orange Lobby" };

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const check = "flex items-center gap-2 text-sm font-bold";

/** The fields the add form and the edit form share. `readFormPolicy` in `./actions` reads them back; neither `submissions_open` nor `sort_order` are here — see that file's note. */
function FormFields({ form }: { form?: Form }) {
  return (
    <>
      <Field label="Name" name="name" defaultValue={form?.name} placeholder="Feedback" />
      <Field label="Description (optional)" name="description" textarea defaultValue={form?.description} placeholder="Tell us how today went." />
      <Field label="Categories (optional)" name="categories" defaultValue={form?.categories?.join(", ")} placeholder="VIP, Management"
        description="Comma separated. Leave blank to offer it to everyone." />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="max_per_attendee" className="text-sm font-bold">Total submissions per person (optional)</label>
        <input id="max_per_attendee" name="max_per_attendee" type="number" min={1} max={366}
          defaultValue={form?.max_per_attendee ?? ""} placeholder="Unlimited" inputMode="numeric" className={`${input} tabular-nums`} />
      </div>
      <label className={check}>
        <input type="checkbox" name="per_day" defaultChecked={form?.per_day ?? false} className="size-4" />
        At most one submission per day, on top of the total above
      </label>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-extrabold">Questions</h3>
        <QuestionEditor questions={form?.questions ?? []} types={FORM_QUESTION_TYPES} max={MAX_FORM_QUESTIONS} />
      </div>
    </>
  );
}

export default async function FormsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [forms, submissions] = await Promise.all([listForms(ev.id), listSubmissions(ev.id)]);
  // Rolled up from the submissions already loaded rather than queried per form — the same
  // reasoning `booths/page.tsx` gives for stamps: a query per row is how a ten-form event
  // gets slow.
  const counts = submissions.reduce<Record<string, number>>((acc, s) => {
    acc[s.form_id] = (acc[s.form_id] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title="Forms"
        subtitle={`${forms.length} form${forms.length === 1 ? "" : "s"}. Attendees answer these from the portal, as many times as the cap allows.`}
        actions={
          <Modal title="Add a form" hint="Add its questions now, or come back and edit them later." trigger="New form" icon="plus">
            <form action={addFormAction.bind(null, ev.id)} className="grid gap-4">
              <FormFields />
              <label className={check}>
                <input type="checkbox" name="submissions_open" className="size-4" />
                Open for submissions now
              </label>
              <SubmitButton>Add form</SubmitButton>
            </form>
          </Modal>
        }
      />

      {forms.length === 0 ? (
        <Card>
          <CardContent>
            <Empty className="border-0 bg-transparent">
              <EmptyHeader>
                <EmptyTitle>No forms yet</EmptyTitle>
                <EmptyDescription>Add one to let attendees submit something — feedback, a request, a daily check-in — on their own schedule.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        forms.map((f) => {
          const used = counts[f.id] ?? 0;
          return (
            <Card key={f.id}>
              <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/events/${ev.id}/forms/${f.id}`} className="hover:underline">{f.name}</Link>
                    <Badge variant={f.submissions_open ? "default" : "outline"}>{f.submissions_open ? "Open" : "Closed"}</Badge>
                    <Badge variant="secondary">{capSummary(f)}</Badge>
                  </CardTitle>
                  {f.description && <p className="text-sm text-muted-foreground">{f.description}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Link href={`/admin/events/${ev.id}/forms/${f.id}`} className="text-sm text-muted-foreground tabular-nums hover:underline">
                    {used} submission{used === 1 ? "" : "s"}
                  </Link>
                  <form action={toggleFormOpenAction.bind(null, ev.id, f.id)}>
                    <SubmitButton variant="outline">{f.submissions_open ? "Close" : "Open"}</SubmitButton>
                  </form>
                  <Modal title={`Edit ${f.name}`} trigger="Edit" variant="outline">
                    <form action={saveFormAction.bind(null, ev.id, f.id)} className="grid gap-4">
                      <FormFields form={f} />
                      <SubmitButton>Save</SubmitButton>
                    </form>
                  </Modal>
                  <form action={deleteFormAction.bind(null, ev.id, f.id)}>
                    <ConfirmButton
                      message={`Delete “${f.name}”? ${used > 0 ? `This takes ${used} submission${used === 1 ? "" : "s"} with it. ` : ""}This cannot be undone.`}
                      className="text-destructive"
                    >
                      Delete
                    </ConfirmButton>
                  </form>
                </div>
              </CardHeader>
            </Card>
          );
        })
      )}
    </div>
  );
}
