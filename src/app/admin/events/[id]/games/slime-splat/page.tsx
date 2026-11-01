import { requireEventAccess } from "@/lib/access";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { eventFeatures, has, NotInEvent } from "@/features/catalogue";
import { tagsFor } from "@/features/games/client";
import {
  BOARD_PAGE_SIZE, BoardTable, boardSize, GAME_NAME, getSettings, listBoard, phaseSubtitle, SettingsCard, slimeAdminPath,
} from "@/features/qualifier";
import { saveSlimeSettingsAction } from "./actions";

export const metadata = { title: GAME_NAME };

// Outside the component, as the display and host pages read their clock: the lint rule for
// render purity does not follow a call into a helper.
const subtitleNow = (s: Awaited<ReturnType<typeof getSettings>>) => phaseSubtitle(s, Date.now());

/** Slime Splat under Games (D797): when it is open, who may play, and the leaderboard. */
export default async function SlimeSplat({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  const { page: requested } = await searchParams;
  const { actor, ev } = await requireEventAccess(id);
  const base = slimeAdminPath(ev.id);
  if (!has(await eventFeatures(ev.id), "typing_qualifier")) {
    return <NotInEvent eventId={ev.id} title={GAME_NAME} keys={["typing_qualifier"]} back={base} canTurnOn={actor.kind === "admin"} />;
  }
  const settings = await getSettings(ev.id);

  // The board, 50 to a page. A page past the end, or not a number, is the nearest real one.
  const total = await boardSize(ev.id);
  const pages = Math.max(1, Math.ceil(total / BOARD_PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(requested)) || 1));
  const rows = await listBoard(ev.id, BOARD_PAGE_SIZE, (page - 1) * BOARD_PAGE_SIZE);

  // One naming pass over everyone drawn, so two people who read alike are told apart.
  const tags = tagsFor(rows.map((r) => ({ id: r.attendee_id, name: r.name, extra: r.extra })));
  const labels = new Map([...tags].map(([k, t]) => [k, t.label]));

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title={GAME_NAME}
        subtitle={subtitleNow(settings)}
        actions={total > 0 && (
          <a download href={`${base}/export`} className={buttonVariants({ variant: "outline" })}>Export CSV</a>
        )}
      />
      <SettingsCard settings={settings} action={saveSlimeSettingsAction.bind(null, ev.id)} />
      <Card className="overflow-hidden py-0">
        <CardContent className="px-0">
          <BoardTable eventId={ev.id} rows={rows} labels={labels} page={page} total={total} />
        </CardContent>
      </Card>
    </div>
  );
}
