import { requireEventAccess } from "@/lib/access";
import { eventFields } from "@/lib/attendee-fields";
import { exportColumns } from "@/lib/export-columns";
import { listAttendees } from "@/lib/db/attendees";
import { listActivities, listBooths, listStampsForEvent } from "@/features/activities";
import { buildPassportWorkbook } from "@/lib/exports";
import { listResultsForEvent, readPassportTest } from "@/features/passport-test";

// No `ids` param, same as rosters.xlsx: the passport answers a whole-room question — who has
// collected what — not a per-selection one, so there is no selection to honour here either.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { ev } = await requireEventAccess(id);
  const [everyone, passports, booths, stamps, results] = await Promise.all([
    listAttendees(ev.id, undefined, "wide", { includeCancelled: true }), listActivities(ev.id, "passport"), listBooths(ev.id), listStampsForEvent(ev.id),
    listResultsForEvent(ev.id),
  ]);
  // D582: a cancelled person keeps the stamps they collected, but a cancelled person with none has no row.
  const stampedIds = new Set(stamps.map((s) => s.attendee_id));
  const attendees = everyone.filter((a) => !a.cancelled_at || stampedIds.has(a.id));
  // A workbook with no sheets is corrupt (Excel refuses it); the Exports page only offers this link
  // when booths exist, so this is reachable only by URL — return 404 rather than broken file (D100/D181).
  if (passports.length === 0) return new Response("This event has no booth passport.", { status: 404 });
  const sheets = passports.map((p) => {
    // D888: a passport with a test (or results) gains Personality and Passport name.
    const test = readPassportTest(p.passport_test);
    const mine = results.filter((r) => r.activity_id === p.id);
    const named = new Map(test.personalities.map((x) => [x.id, x.name]));
    return {
      name: p.name, booths: booths.filter((b) => b.activity_id === p.id), required: p.stamps_required,
      results: test.on || mine.length ? new Map(mine.map((r) => [r.attendee_id, { personality: named.get(r.personality_id) ?? "Other", holderName: r.holder_name }])) : undefined,
    };
  });
  const buf = await buildPassportWorkbook(attendees, sheets, stamps, exportColumns(eventFields(ev.registration_questions, ev.attendee_fields), ev.export_fields)).xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ev.slug}-passport.xlsx"`,
    },
  });
}
