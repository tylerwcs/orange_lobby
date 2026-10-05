import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { eventFields } from "@/lib/attendee-fields";
import { exportColumns } from "@/lib/export-columns";
import { listAttendees } from "@/lib/db/attendees";
import { listActivities, listSubmissions } from "@/lib/db/activities";
import { listGroups } from "@/lib/db/groups";
import { signedSubmissionUrls } from "@/lib/db/media";
import { buildFormsWorkbook, leaderboardRows, addLeaderboardSheet, type FormSheet } from "@/lib/exports";
import { loadChallenge } from "@/lib/challenge-data";
import { nowInKL } from "@/lib/time";
import { fileQuestionKeys, missingFrom, isGroupForm } from "@/lib/submissions";
import { withGroupColumn, groupsNotDone, GROUP_EXPORT_KEY } from "@/lib/groups";

// Seven days: long enough that a spreadsheet downloaded today still opens its photographs
// next week, short enough that the bucket stays private in spirit, not just in policy.
const LINK_SECONDS = 7 * 24 * 60 * 60;

// D400: by the end of a 9-week challenge this reads ~10,000 entries, signs a link for every
// photo and builds the workbook - past the default serverless timeout, as the Attendees page's
// masterlist import was.
export const maxDuration = 120;

// Same shape as activities.xlsx: the whole event's submission activities, not a selection, so
// there is no `ids` param and no way for it to fail open.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);

  const [forms, submissions, attendees, groups] = await Promise.all([
    listActivities(ev.id, "submission"), listSubmissions(ev.id), listAttendees(ev.id), listGroups(ev.id),
  ]);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const attendeeById = new Map(attendees.map((a) => [a.id, a]));
  const byForm = new Map<string, typeof submissions>();
  for (const s of submissions) byForm.set(s.activity_id, [...(byForm.get(s.activity_id) ?? []), s]);

  // Every photo link in the workbook, signed in batches up front rather than one Storage call
  // per photo (D383).
  const formById = new Map(forms.map((f) => [f.id, f]));
  const links = await signedSubmissionUrls(submissions.flatMap((s) => {
    const f = formById.get(s.activity_id);
    return f ? fileQuestionKeys(f.questions).map((k) => s.answers[k] ?? "") : [];
  }), LINK_SECONDS);

  const sheets: FormSheet[] = forms.map((f) => {
    const fileKeys = new Set(fileQuestionKeys(f.questions));
    const questions = f.questions.map((q) => ({
      key: q.key,
      label: fileKeys.has(q.key) ? `${q.label} (link expires in 7 days)` : q.label,
      file: fileKeys.has(q.key),
    }));
    const rows = (byForm.get(f.id) ?? []).map((s) => {
      const a = attendeeById.get(s.attendee_id);
      const answers: Record<string, string> = {};
      for (const [key, value] of Object.entries(s.answers)) {
        if (fileKeys.has(key) && value) {
          // A null here means the object went missing from storage, not that the answer was
          // empty — render that honestly instead of a link that 404s.
          answers[key] = links.get(value) ?? "(file unavailable)";
        } else {
          answers[key] = value;
        }
      }
      // The row's group is the one the entry was sent for (D355), not the attendee's current
      // one; a group_id gone null (its group was deleted, D349) still says so.
      const extra = {
        ...(a?.extra ?? {}),
        [GROUP_EXPORT_KEY]: s.group_id ? groupName.get(s.group_id) ?? "" : (f.group_mode !== "off" ? "Deleted group" : ""),
      };
      return {
        name: a?.name ?? "Unknown", email: a?.email ?? null, category: a?.category ?? null,
        submittedOn: s.submitted_on, createdAt: s.created_at, answers, extra,
      };
    });
    const missingRow = (a: (typeof attendees)[number] | undefined) => {
      const extra = { ...(a?.extra ?? {}), [GROUP_EXPORT_KEY]: a?.group_id ? groupName.get(a.group_id) ?? "" : "" };
      return { name: a?.name ?? "Unknown", email: a?.email ?? null, category: a?.category ?? null, extra };
    };
    // D354/D360: a group form is chased by group, not by person — the ungrouped and members of
    // an already-done group are not missing. `groupsNotDone` is the same read `SubmissionDetail`
    // uses, so the "Not done" tab and this sheet can't disagree on who a group form still needs.
    // Otherwise (`null` for the day): the download has no day context, so this is who has NEVER
    // submitted (D175). `listAttendees` order is alphabetical and `missingFrom` keeps it.
    const missing = isGroupForm(f.group_mode)
      ? groupsNotDone(f, groups, attendees, submissions).flatMap((g) => g.missingIds.map((aid) => missingRow(attendeeById.get(aid))))
      : missingFrom(f, submissions, attendees.map((a) => a.id), (aid) => attendeeById.get(aid)?.category ?? null, null)
          .map((aid) => missingRow(attendeeById.get(aid)));

    return { formName: f.name, questions, rows, missing };
  });

  const columns = withGroupColumn(exportColumns(eventFields(ev.registration_questions, ev.attendee_fields), ev.export_fields), groups.length > 0);
  const wb = buildFormsWorkbook(sheets, columns);
  // D381: a scored challenge also gets its leaderboard, scored by the same read the tab uses.
  for (const f of forms.filter((x) => x.scoring)) {
    const { score } = await loadChallenge(ev, f, nowInKL().date);
    addLeaderboardSheet(wb, `${f.name} leaderboard`, leaderboardRows(score));
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ev.slug}-submissions.xlsx"`,
    },
  });
}
