import { loadPortalAttendee } from "@/lib/portal";
import { listForms, submissionsForAttendee } from "@/lib/db/forms";
import { canSubmit } from "@/lib/forms";
import { nowInKL } from "@/lib/time";
import { FormList } from "@/components/portal/FormList";

export const dynamic = "force-dynamic";

export default async function FormsPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const [forms, submissions] = await Promise.all([
    listForms(event.id),
    submissionsForAttendee(attendee.id),
  ]);
  const today = nowInKL().date;
  const entries = forms.map((form) => {
    const mine = submissions.filter((s) => s.form_id === form.id);
    return { form, state: canSubmit(form, mine, attendee.category, today) };
  });
  return (
    <>
      <h1 className="mb-3 text-xl font-extrabold">Forms</h1>
      <FormList entries={entries} basePath={`/e/${slug}/a/${token}/forms`} />
    </>
  );
}
