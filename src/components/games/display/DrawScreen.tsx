"use client";
import { motion } from "motion/react";
import type { DisplayState, Person } from "@/lib/games/wire";
import type { Synth } from "@/lib/games/sound";
import { MAX_REELS, reelLayout } from "@/lib/games/layout";
import { useServerNow } from "../usePoll";
import { Frame } from "./Frame";
import { JointWinners, WinnerCard } from "./WinnerCard";

/**
 * The lucky draw on the LED (D279–D282, D310–D319): the HTML over the 3D scenes — titles, the
 * frames round the reels, the wheel's caption, the mosaic, the card round's prompts, and the
 * winner cards.
 */
export function DrawScreen({ state, offset }: { state: DisplayState; offset: number; synth?: Synth }) {
  const s = state.stage;
  const d = state.draw!;
  const title = s.game?.title ?? "Lucky draw";
  const now = useServerNow(offset, 100, s.phase === "draw_spinning");

  if (s.phase === "draw_ready") {
    return (
      <Frame title={title} right={`${d.pool} in the draw`}>
        <div className="flex h-full flex-col items-center justify-center gap-8">
          {d.prize ? (
            <>
              <p className="font-game text-5xl opacity-85">Next up</p>
              <motion.p key={d.prize} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 14 }}
                className="line-clamp-4 max-w-[1700px] break-words text-center font-game text-[150px] leading-none drop-shadow-[0_8px_40px_var(--brand)]">{d.prize}</motion.p>
            </>
          ) : <p className="font-game text-8xl">All prizes drawn 🎉</p>}
        </div>
      </Frame>
    );
  }

  if (s.phase === "draw_spinning") {
    const targets = d.targets ?? [];
    return (
      <Frame title={title} right={d.prize ?? ""}>
        {targets.length > MAX_REELS
          ? <Cascade people={targets} endsAt={s.endsAt} now={now} />
          : <ReelFrames count={targets.length} />}
      </Frame>
    );
  }

  const winners = d.winners ?? [];
  if (s.phase !== "draw_reveal") return null;
  if (winners.length === 0) {
    return <Frame title={title}><div className="flex h-full items-center justify-center font-game text-7xl">No one left to draw</div></Frame>;
  }
  if (winners.length === 1) return <WinnerCard label="Winner" name={winners[0].name} company={winners[0].company} prize={d.prize} />;
  return <JointWinners title="Winners" winners={winners} prize={d.prize} />;
}

/**
 * The window round each 3D reel (D313), in LED pixels: a bright border, and fades top and bottom
 * so the names roll in and out. Frame's content box is not positioned, so `absolute inset-0`
 * here is the whole 1920×1080 screen layer — the same pixels reelLayout and the 3D reels use.
 */
function ReelFrames({ count }: { count: number }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {reelLayout(count).map((b, i) => (
        <div key={i} className="absolute overflow-hidden rounded-[28px] ring-8 ring-[var(--brand)] shadow-[0_0_60px_var(--brand)]"
          style={{ left: b.x - b.w / 2, top: b.y - b.h / 2, width: b.w, height: b.h }}>
          <div className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-black/80 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/80 to-transparent" />
        </div>
      ))}
    </div>
  );
}

/** More winners than reels (D313): the names cascade into a grid over the spin. */
function Cascade({ people, endsAt, now }: { people: Person[]; endsAt: number | null; now: number }) {
  const left = endsAt === null ? 0 : Math.max(0, endsAt - now);
  return (
    <div className="grid h-full content-center gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(8, Math.ceil(Math.sqrt(people.length * 2)))}, minmax(0, 1fr))` }}>
      {people.map((p, i) => (
        <motion.div key={p.id} initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: (i / people.length) * Math.max(0.5, left / 1000 - 0.5) }}
          className="truncate rounded-2xl bg-black/40 px-4 py-3 text-center font-game text-3xl">{p.first} {p.initials}</motion.div>
      ))}
    </div>
  );
}
