import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { getGame, listWinners } from "@/lib/db/games";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { listAttendeesByIds, listCategories } from "@/lib/db/attendees";
import { GAME_KIND_LABELS } from "@/lib/games/config";
import { prizeProgress } from "@/lib/games/draw";
import { fieldValue } from "@/lib/attendee-values";
import { formKey } from "@/lib/form-key";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Field } from "@/components/admin/Field";
import { SaveBar } from "@/components/admin/SaveBar";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { QuestionsEditor } from "@/components/admin/QuestionsEditor";
import { PrizesEditor } from "@/components/admin/PrizesEditor";
import { DrawFormatFields } from "@/components/admin/DrawFormatFields";
import { BackgroundPicker } from "@/components/admin/BackgroundPicker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resetDrawAction, updateGameAction } from "../actions";

export const metadata = { title: "Game" };

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function GameEditor({ params }: { params: Promise<{ id: string; gameId: string }> }) {
  const { id, gameId } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const game = await getGame(gameId, ev.id);
  if (!game) notFound();
  const back = `/admin/events/${ev.id}/games`;

  const [checkpoints, categories, winners] = game.kind === "draw"
    ? await Promise.all([listCheckpoints(ev.id), listCategories(ev.id), listWinners(game.id)])
    : [[], [], []];
  // Only the winners' rows: the whole list would stop at one request's worth on a big event.
  const people = await listAttendeesByIds(ev.id, winners.map((w) => w.attendee_id));
  const byId = new Map(people.map((a) => [a.id, a]));

  // "Leave out" offers each category PART on its own, from the same source as the "Who can see
  // it" picker (listCategories), so ticking Crew also leaves out "KOM, Crew" (draw_spin's
  // category_matches). A saved exclusion nobody carries any more stays on the list, ticked, so
  // saving the form never drops it silently.
  const excluded = game.kind === "draw" ? game.config.exclude_categories : [];
  const known = new Set(categories.map((c) => c.toLowerCase()));
  const leaveOut = [...categories, ...excluded.filter((x) => !known.has(x.toLowerCase()))];
  const isExcluded = (c: string) => excluded.some((x) => x.toLowerCase() === c.toLowerCase());

  return (
    <div className="flex flex-col gap-4">
      <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">← Games</Link>
      <AdminHeader title={game.title} subtitle={GAME_KIND_LABELS[game.kind]} />

      <Card className="overflow-hidden">
        <CardContent>
          <form key={formKey({ title: game.title, config: game.config })} action={updateGameAction.bind(null, ev.id, game.id)} className="flex flex-col gap-4">
            <Field label="Name" name="title" defaultValue={game.title} />

            {game.kind === "tap_race" && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="duration_s" className="text-sm font-bold">Race length (seconds)</label>
                <input id="duration_s" name="duration_s" type="number" min={10} max={60} defaultValue={game.config.duration_s} className={`${input} max-w-32 tabular-nums`} />
                <p className="text-xs text-muted-foreground">Lanes are picked on the host console when the race starts: by category, by any attendee field such as table, or everyone solo.</p>
              </div>
            )}

            {game.kind === "survival" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="answer_s" className="text-sm font-bold">Answer time (seconds)</label>
                  <input id="answer_s" name="answer_s" type="number" min={5} max={30} defaultValue={game.config.answer_s} className={`${input} max-w-32 tabular-nums`} />
                </div>
                <QuestionsEditor initial={game.config.questions} />
              </>
            )}

            {game.kind === "draw" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="checkpoint_id" className="text-sm font-bold">Who is in the draw</label>
                  <select id="checkpoint_id" name="checkpoint_id" defaultValue={game.config.checkpoint_id ?? ""} className={input}>
                    <option value="">Pick a checkpoint…</option>
                    {checkpoints.map((c) => <option key={c.id} value={c.id}>Checked in at {c.name}</option>)}
                  </select>
                  {checkpoints.length === 0 && <p className="text-xs text-muted-foreground">This event has no checkpoints. Add one in Settings — the draw only picks people who checked in.</p>}
                </div>
                {leaveOut.length > 0 && (
                  <fieldset className="flex flex-col gap-1.5">
                    <legend className="mb-1.5 text-sm font-bold">Leave out</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {leaveOut.map((c) => (
                        <label key={c} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="exclude" value={c} defaultChecked={isExcluded(c)} className="size-4" />
                          {c}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Someone in several categories (KOM, Crew) is left out if any one of them is ticked.</p>
                  </fieldset>
                )}
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold">Prizes</span>
                  <PrizesEditor initial={game.config.prizes} />
                </div>
                <DrawFormatFields format={game.config.format} spinS={game.config.spin_s} rounds={game.config.rounds} />
              </>
            )}
            <BackgroundPicker eventId={ev.id} gameId={game.id} current={game.config.background} />
            <SaveBar inCard />
          </form>
        </CardContent>
      </Card>

      {game.kind === "draw" && (
        <Card>
          <CardHeader>
            <CardTitle>Winners</CardTitle>
            <CardDescription>
              {prizeProgress(game.config.prizes, winners).map((p) => `${p.name} ${p.given}/${p.quantity}`).join(" · ") || "No prizes yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {winners.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody drawn yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {winners.map((w) => {
                  const a = byId.get(w.attendee_id);
                  const company = a ? fieldValue(a, "company") : "";
                  return (
                    <li key={w.id} className={`flex gap-3 py-2 ${w.void ? "text-muted-foreground line-through" : ""}`}>
                      <span className="w-40 shrink-0 truncate font-bold">
                        {w.prize_no === null ? "No card picked" : game.config.prizes[w.prize_no]?.name ?? `Prize ${w.prize_no + 1}`}
                        {typeof w.card_no === "number" ? ` · card ${w.card_no}` : ""}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{a?.name ?? "(removed attendee)"}{company ? ` · ${company}` : ""}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {/* A plain anchor, not `<Link>`: prefetching an export route would build the file on hover. */}
              <a download href={`/admin/events/${ev.id}/export/winners.xlsx?game=${game.id}`} className="text-sm font-bold text-primary">Download winners (.xlsx)</a>
              {winners.length > 0 && (
                <form action={resetDrawAction.bind(null, ev.id, game.id)} className="ml-auto">
                  <ConfirmButton message="Reset this draw? Its winners are cleared and go back into every draw's pool. Use this after a rehearsal, not during the event.">Reset draw</ConfirmButton>
                </form>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
