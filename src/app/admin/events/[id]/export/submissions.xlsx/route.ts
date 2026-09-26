import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees } from "@/lib/db/attendees";
import { listActivities, listSubmissions } from "@/lib/db/activities";
import { signedSubmissionUrl } from "@/lib/db/media";
import { buildFormsWorkbook, type FormSheet } from "@/lib/exports";
import { fileQuestionKeys, missingFrom } from "@/lib/submissions";

// Seven days: long enough that a spreadsheet downloaded today still opens its photographs
// next week, short enough that the bucket stays private in spirit, not just in policy.
const LINK_SECONDS = 7 * 24 * 60 * 60;

// Same shape as activities.xlsx: the whole event's submission activities, not a selection, so
// there is no `ids` param and no way for it to fail open.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);

  const [forms, submissions, attendees] = await Promise.all([
    listActivities(ev.id, "submission"), listSubmissions(ev.id), listAttendees(ev.id),
  ]);
  const attendeeById = new Map(attendees.map((a) => [a.id, a]));
  const byForm = new Map<string, typeof submissions>();
  for (const s of submissions) byForm.set(s.activity_id, [...(byForm.get(s.activity_id) ?? []), s]);

  const sheets: FormSheet[] = await Promise.all(forms.map(async (f) => {
    const fileKeys = new Set(fileQuestionKeys(f.questions));
    const questions = f.questions.map((q) => ({
      key: q.key,
      label: fileKeys.has(q.key) ? `${q.label} (link expires in 7 days)` : q.label,
      file: fileKeys.has(q.key),
    }));
    const rows = await Promise.all((byForm.get(f.id) ?? []).map(async (s) => {
      const a = attendeeById.get(s.attendee_id);
      const answers: Record<string, string> = {};
      for (const [key, value] of Object.entries(s.answers)) {
        if (fileKeys.has(key) && value) {
          // A null here means the object went missing from storage, not that the answer was
          // empty — render that honestly instead of a link that 404s.
          answers[key] = (await signedSubmissionUrl(value, LINK_SECONDS)) ?? "(file unavailable)";
        } else {
          answers[key] = value;
        }
      }
      return {
        name: a?.name ?? "Unknown", email: a?.email ?? null, category: a?.category ?? null,
        submittedOn: s.submitted_on, createdAt: s.created_at, answers,
      };
    }));
    // `null` for the day: the download has no day context, so this is who has NEVER
    // submitted (D175). `listAttendees` order is alphabetical and `missingFrom` keeps it.
    const missing = missingFrom(f, submissions, attendees.map((a) => a.id), (aid) => attendeeById.get(aid)?.category ?? null, null)
      .map((aid) => {
        const a = attendeeById.get(aid);
        return { name: a?.name ?? "Unknown", email: a?.email ?? null, category: a?.category ?? null };
      });

    return { formName: f.name, questions, rows, missing };
  }));

  const buf = await buildFormsWorkbook(sheets).xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ev.slug}-submissions.xlsx"`,
    },
  });
}
