import type { PublicQuestion } from "@/lib/games/views";
import { OPTION_STYLES } from "@/lib/games/views";

/**
 * A question on the LED (D276): the question, the colour-coded options, and either the
 * countdown or how the room split. Once `q.correct` is set (reveal), the others dim.
 */
export function QuestionBoard({ q, now, answered, players, split, showTimer = false }: {
  q: PublicQuestion;
  now: number;
  answered?: number;
  players?: number;
  split?: number[] | null;
  showTimer?: boolean;
}) {
  const left = q.deadline ? Math.max(0, Math.ceil((q.deadline - now) / 1000)) : 0;
  const total = split ? Math.max(1, split.reduce((a, b) => a + b, 0)) : 1;
  return (
    <div className="flex h-full flex-col gap-10">
      <div className="flex items-center justify-between text-4xl font-bold opacity-80">
        <span>Question {q.no + 1} of {q.total}</span>
        {showTimer
          ? <span className="text-7xl font-extrabold tabular-nums text-[var(--brand)]">{left}</span>
          : q.correct === null && <span>Time&apos;s up!</span>}
      </div>
      <p className="text-center text-[80px] font-extrabold leading-tight">{q.text}</p>
      <div className="grid flex-1 grid-cols-2 gap-6">
        {q.options.map((o, i) => {
          const right = q.correct === i;
          const dim = q.correct !== null && !right;
          return (
            <div key={i}
              className={`relative flex items-center gap-6 overflow-hidden rounded-3xl px-10 text-6xl font-extrabold transition-opacity duration-500 ${dim ? "opacity-25" : ""} ${right ? "ring-8 ring-white" : ""}`}
              style={{ background: OPTION_STYLES[i].colour }}>
              {split && <div className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${((split[i] ?? 0) / total) * 100}%` }} />}
              <span className="relative text-7xl">{OPTION_STYLES[i].letter}</span>
              <span className="relative min-w-0 flex-1 truncate">{o}</span>
              {split && <span className="relative tabular-nums">{split[i] ?? 0}</span>}
              {right && <span className="relative">✓</span>}
            </div>
          );
        })}
      </div>
      {showTimer && answered !== undefined && <p className="text-center text-4xl opacity-70">{answered} of {players ?? 0} answered</p>}
    </div>
  );
}
