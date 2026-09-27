"use client";
import { useEffect, useRef, useState } from "react";
import type { DisplayState, Person } from "@/lib/games/wire";
import { QUICK_SPIN_MS } from "@/lib/games/phase";
import { Frame } from "./Frame";
import { JointWinners, WinnerCard } from "./WinnerCard";

/** The lucky draw on the LED (D279–D282): the next prize, the rolling names, the winner. */
export function DrawScreen({ state, offset }: { state: DisplayState; offset: number }) {
  const s = state.stage;
  const d = state.draw!;
  const title = s.game?.title ?? "Lucky draw";

  if (s.phase === "draw_ready") {
    return (
      <Frame title={title} right={`${d.pool} in the draw`}>
        <div className="flex h-full flex-col items-center justify-center gap-8">
          {d.prize ? (
            <>
              <p className="text-5xl opacity-70">Next up</p>
              <p className="line-clamp-4 max-w-[1700px] break-words text-center text-[150px] font-extrabold leading-none text-[var(--brand)]">{d.prize}</p>
            </>
          ) : <p className="text-8xl font-extrabold">All prizes drawn 🎉</p>}
        </div>
      </Frame>
    );
  }

  if (s.phase === "draw_spinning") {
    return <Frame title={title} right={d.prize ?? ""}><Roller sample={d.sample} endsAt={s.endsAt} offset={offset} /></Frame>;
  }

  const winners = d.winners ?? [];
  if (winners.length === 0) {
    return <Frame title={title}><div className="flex h-full items-center justify-center text-7xl font-extrabold">No one left to draw</div></Frame>;
  }
  if (winners.length === 1) return <WinnerCard label="Winner" name={winners[0].name} company={winners[0].company} prize={d.prize} />;
  return <JointWinners title="Winners" winners={winners} prize={d.prize} />;
}

/**
 * Names roll fast and slow down to a stop as the spin ends (D280). Theatre only: the winner was
 * drawn before this started and is not in the data until the reveal.
 */
function Roller({ sample, endsAt, offset }: { sample: Person[]; endsAt: number | null; offset: number }) {
  const i = useRoller(sample.length, endsAt, offset);
  const p = sample[i];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="flex h-[360px] w-[1500px] items-center justify-center overflow-hidden rounded-[48px] border-8 border-[var(--brand)] bg-white/5 px-12">
        <span className="truncate text-[160px] font-extrabold leading-none">{p ? `${p.initials} · ${p.first}` : "…"}</span>
      </div>
      <p className="text-4xl opacity-60">Drawing…</p>
    </div>
  );
}

/** Which of `count` names to show: a step every 50 ms at the start, easing out to ~450 ms at the end. */
function useRoller(count: number, endsAt: number | null, offset: number): number {
  const [i, setI] = useState(0);
  const offsetRef = useRef(offset);
  useEffect(() => { offsetRef.current = offset; }, [offset]);
  useEffect(() => {
    if (count === 0 || endsAt === null) return;
    let t: ReturnType<typeof setTimeout>;
    let stopped = false;
    const step = () => {
      if (stopped) return;
      setI((x) => (x + 1) % count);
      const left = endsAt - (Date.now() + offsetRef.current);
      const done = 1 - Math.max(0, Math.min(1, left / QUICK_SPIN_MS));
      t = setTimeout(step, 50 + 400 * done * done);
    };
    t = setTimeout(step, 50);
    return () => { stopped = true; clearTimeout(t); };
  }, [count, endsAt]);
  return count ? i % count : 0;
}
