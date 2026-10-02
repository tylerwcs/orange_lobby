import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ChallengeScore, Team } from "@/lib/challenge-score";
import type { ChallengeWeek } from "@/lib/challenge";
import type { Disqualification } from "@/lib/db/challenge";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

/** D381: one team's members against the week's days, km in each cell, with Disqualify and Undo (D380). */
export function TeamGrid({ team, week, score, names, dq, dailyMin, back, disqualify, undo }: {
  team: Team; week: ChallengeWeek; score: ChallengeScore; names: Map<string, string>; dq: Disqualification[]; dailyMin: number;
  back: string;
  disqualify: (attendeeId: string) => (fd: FormData) => Promise<void>;
  undo: (attendeeId: string) => (fd: FormData) => Promise<void>;
}) {
  const dqBy = new Map(dq.map((d) => [d.attendee_id, d]));
  const short = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
  return (
    <div className="flex flex-col gap-3">
      <Link href={back} className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />All teams</Link>
      <h3 className="text-base font-extrabold">{team.name}</h3>
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
              return (
                <tr key={id} className="border-t border-border align-top">
                  <td className="py-2 pr-3 font-bold">{name}{d && <span className="block text-xs font-normal text-destructive">Disqualified: {d.reason}</span>}</td>
                  {week.days.map((day) => {
                    const km = score.personKm(id, day);
                    return <td key={day} className={`px-1.5 py-2 text-right tabular-nums ${km >= dailyMin ? "" : "text-muted-foreground/60"}`}>{km || "–"}</td>;
                  })}
                  <td className="py-2 pl-3">
                    {d ? (
                      <form action={undo(id)}><input type="hidden" name="team" value={team.id} /><SubmitButton size="sm" variant="outline">Undo</SubmitButton></form>
                    ) : (
                      <form action={disqualify(id)} className="flex gap-1.5">
                        <input type="hidden" name="team" value={team.id} />
                        <input name="reason" required placeholder="Reason" aria-label={`Reason to disqualify ${name}`} className="h-8 w-32 rounded-md border border-input bg-transparent px-2 text-xs" />
                        {/* A whole team goes Void on one press, so it asks first (D380). */}
                        <ConfirmButton
                          message={`Disqualify ${name}? ${team.name} will show Void on every leaderboard.`}
                          confirmLabel="Disqualify"
                          triggerVariant="destructive"
                          className="h-8 px-2.5 text-xs"
                        >
                          Disqualify
                        </ConfirmButton>
                      </form>
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
