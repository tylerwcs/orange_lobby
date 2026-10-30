import { requireEventAccess } from "@/lib/access";
import { listAttendeesByIds } from "@/lib/db/attendees";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { eventFeatures, has, NotInEvent } from "@/features/catalogue";
import { tagsFor } from "@/features/games/client";
import {
  BOARD_PAGE_SIZE, BoardTable, boardSize, ConfirmCard, FINALISTS, getSettings, listBoard, listFinalists,
  phaseOf, phaseSubtitle, SettingsCard, type BoardRow, type FinaleEntry,
} from "@/features/qualifier";
import { confirmFinalistsAction, saveQualifierSettingsAction } from "./actions";

export const metadata = { title: "Typing qualifier" };

// Outside the component, as the display and host pages read their clock: the lint rule for
// render purity does not follow a call into a helper.
const subtitleNow = (s: Awaited<ReturnType<typeof getSettings>>) => phaseSubtitle(s, Date.now());
const phaseNow = (s: Awaited<ReturnType<typeof getSettings>>) => phaseOf(s, Date.now());

export default async function Qualifier({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  const { page: requested } = await searchParams;
  const { actor, ev } = await requireEventAccess(id);
  if (!has(await eventFeatures(ev.id), "typing_qualifier")) {
    return <NotInEvent eventId={ev.id} title="Typing qualifier" keys={["typing_qualifier"]} back={`/admin/events/${ev.id}/qualifier`} canTurnOn={actor.kind === "admin"} />;
  }
  const settings = await getSettings(ev.id);
  const phase = phaseNow(settings);

  // The board, 50 to a page. A page past the end, or not a number, is the nearest real one.
  const total = await boardSize(ev.id);
  const pages = Math.max(1, Math.ceil(total / BOARD_PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(requested)) || 1));
  const rows = await listBoard(ev.id, BOARD_PAGE_SIZE, (page - 1) * BOARD_PAGE_SIZE);

  // The finale card: the live top 10 in review, the frozen list once confirmed.
  const showFinale = phase === "review" || phase === "confirmed";
  const top: BoardRow[] = !showFinale ? [] : page === 1 ? rows.slice(0, FINALISTS) : await listBoard(ev.id, FINALISTS, 0);
  const finalists = phase === "confirmed" ? await listFinalists(ev.id) : [];
  const finalistPeople = finalists.length > 0 ? await listAttendeesByIds(ev.id, finalists.map((f) => f.attendee_id)) : [];

  // One naming pass over everyone drawn, so two people who read alike are told apart.
  const people = new Map<string, { id: string; name: string; extra: Record<string, unknown> | null }>();
  for (const r of [...rows, ...top]) people.set(r.attendee_id, { id: r.attendee_id, name: r.name, extra: r.extra });
  for (const a of finalistPeople) people.set(a.id, { id: a.id, name: a.name, extra: a.extra });
  const tags = tagsFor([...people.values()]);
  const labels = new Map([...tags].map(([k, t]) => [k, t.label]));

  const entries: FinaleEntry[] = phase === "confirmed"
    ? finalists.map((f) => ({
        rank: f.rank, attendeeId: f.attendee_id, label: labels.get(f.attendee_id) ?? "?",
        name: people.get(f.attendee_id)?.name ?? "", wpm: f.best_wpm, accuracy: f.best_accuracy, flagged: false,
      }))
    : top.map((r) => ({
        rank: r.rank, attendeeId: r.attendee_id, label: labels.get(r.attendee_id) ?? r.name,
        name: r.name, wpm: r.best_wpm, accuracy: r.best_accuracy, flagged: r.flagged,
      }));

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title="Typing qualifier"
        subtitle={subtitleNow(settings)}
        actions={total > 0 && (
          <a download href={`/admin/events/${ev.id}/qualifier/export`} className={buttonVariants({ variant: "outline" })}>Export CSV</a>
        )}
      />
      <SettingsCard settings={settings} action={saveQualifierSettingsAction.bind(null, ev.id)} />
      {showFinale && <ConfirmCard confirmedAt={settings?.confirmed_at ?? null} entries={entries} action={confirmFinalistsAction.bind(null, ev.id)} />}
      <Card className="overflow-hidden py-0">
        <CardContent className="px-0">
          <BoardTable eventId={ev.id} rows={rows} labels={labels} page={page} total={total} />
        </CardContent>
      </Card>
    </div>
  );
}
