import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ChallengeScore, Team } from "../../../lib/challenge-score";
import { mondayOf, type ChallengeWeek } from "../../../lib/challenge";
import type { Disqualification } from "../../../db/challenge";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { DisqualifyForm } from "./DisqualifyForm";

/** D381: one team's members against the week's days, km in each cell, with Disqualify and Undo (D380). */
export function TeamGrid({ team, week, score, names, dq, dailyMin, weekVoid, back, disqualify, undo }: {
  team: Team; week: ChallengeWeek; score: ChallengeScore; names: Map<string, string>; dq: Disqualification[]; dailyMin: number;
  /** D467: a disqualification voids the grid's week, not the season. */
  weekVoid: boolean;
  back: string;
  disqualify: (attendeeId: string) => (fd: FormData) => Promise<void>;
  undo: (attendeeId: string) => (fd: FormData) => Promise<void>;
}) {
  const dqBy = new Map(dq.map((d) => [d.attendee_id, d]));
  // A disqualified member voids the whole team (D380), which the heading says rather than leaving it to the table.
  const isVoid = score.standings.find((x) => x.id === team.id)?.void ?? false;
  // D467: under a week void only the voided week says so, and each disqualification names its week.
  const weekVoided = score.weeks.find((w) => w.week.number === week.number)?.teams[team.id]?.void ?? false;
  const weekOf = (monday: string | null) => score.weeks.find((w) => w.week.days.length > 0 && mondayOf(w.week.days[0]) === monday)?.week.number;
  const short = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
  return (
    <div className="flex flex-col gap-3">
      <Link href={back} className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />All teams</Link>
      <h3 className="text-base font-extrabold">{team.name}</h3>
      {isVoid && <p className="text-sm font-bold text-destructive">Void: a member is disqualified.</p>}
      {weekVoided && <p className="text-sm font-bold text-destructive">Week {week.number} is void: a member is disqualified.</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3">Member</th>
            {week.days.map((d) => <th key={d} className="px-1.5 py-2 text-right tabular-nums">{short(d)}</th>)}
            <th className="py-2 pl-3" />
          </tr></thead>
          <tbody>
            {team.memberIds.map((id) => {
              const d = dqBy.get(id);
              const name = names.get(id) ?? "Unknown";
              const from = d && weekVoid ? weekOf(d.week_of) : undefined;
              return (
                <tr key={id} className="border-t border-border align-top">
                  <td className="py-2 pr-3 font-bold">{name}{d && <span className="block text-xs font-normal text-destructive">Disqualified{from ? ` from Week ${from}` : ""}: {d.reason}</span>}</td>
                  {week.days.map((day) => {
                    const km = score.personKm(id, day);
                    return <td key={day} className={`px-1.5 py-2 text-right tabular-nums ${km >= dailyMin ? "" : "text-muted-foreground/60"}`}>{km || "–"}</td>;
                  })}
                  <td className="py-2 pl-3">
                    {d ? (
                      <form action={undo(id)}><input type="hidden" name="team" value={team.id} /><input type="hidden" name="week" value={week.number} /><SubmitButton size="sm" variant="outline">Undo</SubmitButton></form>
                    ) : (
                      <DisqualifyForm action={disqualify(id)} teamId={team.id} week={week.number} name={name} teamName={team.name} weekVoid={weekVoid} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
