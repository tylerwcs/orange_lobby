"use client";
import { motion } from "motion/react";
import type { DisplayState, Person } from "@/lib/games/wire";
import type { Synth } from "@/lib/games/sound";
import { MAX_REELS, reelLayout } from "@/lib/games/layout";
import { wheelLabel } from "@/lib/games/wheel";
import { useServerNow } from "../usePoll";
import { Frame } from "./Frame";
import { MosaicDraw } from "./MosaicDraw";
import { JointWinners, WinnerCard } from "./WinnerCard";

/**
 * The lucky draw on the LED (D279–D282, D310–D319): the HTML over the 3D scenes — titles, the
 * frames round the reels, the wheel's caption, the mosaic, the card round's reel window, and the
 * winner cards.
 */
export function DrawScreen({ state, offset }: { state: DisplayState; offset: number; synth?: Synth }) {
  const s = state.stage;
  const d = state.draw!;
  // Cascade (more winners than reels) and the wheel's landed-name overlay are the only things
  // here that read `now` — the reels and the wheel itself animate in 3D off their own useFrame —
  // so gate the 10x/s re-render on those two HTML cases. Without the wheel branch here, `now`
  // would freeze at mount (useServerNow only advances while `active`) and the overlay's
  // `now >= s.endsAt` check would never flip true.
  const wheelSpinning = s.phase === "draw_spinning" && d.format === "wheel" && !d.quick;
  const cascading = s.phase === "draw_spinning" && (d.targets?.length ?? 0) > MAX_REELS;
  const now = useServerNow(offset, 100, cascading || wheelSpinning);

  if (s.phase === "draw_rounds" && d.mosaic) return <MosaicDraw prize={d.prize} mosaic={d.mosaic} seed={s.key} />;

  // A card round (D317): the reel waits, spins and stays on the participant, all in the ReelFrames
  // window with no text (the landed reel names them); then the card grid, text-free as well. The
  // only words are "All cards dealt" once the round is over. Its spin falls through to the slot
  // spin below (no prize line for a card turn).
  if (d.format === "cards" && d.cards && s.phase !== "draw_spinning" && s.phase !== "draw_reveal") {
    const left = d.cards.slots.filter((c) => !c.taken).length;
    if (s.phase === "draw_ready" && left === 0) {
      return <Frame><div className="flex h-full items-center justify-center font-game text-8xl">All cards dealt 🎉</div></Frame>;
    }
    // Layer3D draws the waiting reel from the sample's first name, and the landed one from targets.
    const reel = s.phase === "draw_ready" ? d.sample.length > 0 : s.phase === "draw_card_landed" && (d.targets?.length ?? 0) > 0;
    return <Frame>{reel && <ReelFrames count={1} />}</Frame>;
  }

  if (s.phase === "draw_ready") {
    if (d.format === "wheel") {
      return (
        <Frame>
          <div className="absolute inset-x-0 bottom-16 flex flex-col items-center gap-2 text-center font-game">
            <p className="text-5xl">{d.prize ? `Spinning for ${d.prize}` : "All prizes drawn 🎉"}</p>
            {d.prize && <p className="text-3xl opacity-75">{d.pool} in the draw</p>}
          </div>
        </Frame>
      );
    }
    return (
      <Frame>
        <div className="flex h-full flex-col items-center justify-center gap-6">
          {d.prize ? (
            <>
              <p className="font-game text-5xl opacity-85">Next up</p>
              {d.prizeImage && (
                // key={d.prizeImage}: onError sets display:none directly on the DOM node, which React
                // never clears on its own — without a key tied to the URL, a new prize's <img> would
                // reuse the same hidden node and never show (fix round 1, D323).
                // eslint-disable-next-line @next/next/no-img-element -- an organiser upload; see IdleScreen
                <img key={d.prizeImage} src={d.prizeImage} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }}
                  className="max-h-[520px] max-w-[900px] rounded-3xl object-contain shadow-[0_20px_60px_rgba(0,0,0,0.5)]" />
              )}
              <motion.p key={d.prize} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 14 }}
                className="line-clamp-4 max-w-[1700px] break-words text-center font-game text-[150px] leading-none drop-shadow-[0_8px_40px_var(--brand)]">{d.prize}</motion.p>
              <p className="font-game text-4xl opacity-75">{d.pool} in the draw</p>
            </>
          ) : <p className="font-game text-8xl">All prizes drawn 🎉</p>}
        </div>
      </Frame>
    );
  }

  if (s.phase === "draw_spinning") {
    const targets = d.targets ?? [];
    if (d.format === "wheel" && !d.quick) {
      return (
        <Frame>
          {/* A small centred line, not a corner fact (Requirement 1); none for a card round's turn (there is no prize here anyway). */}
          {d.prize && (
            <p className="absolute inset-x-0 top-10 truncate px-16 text-center font-game text-4xl opacity-85 drop-shadow-[0_4px_16px_rgba(0,0,0,0.45)]">Drawing for {d.prize}</p>
          )}
          {s.endsAt !== null && now >= s.endsAt && d.targets?.[0] && (
            <>
              {/* Dims the wheel behind the name (Requirement 3). */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/55" />
              <motion.div initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }}
                className="absolute left-1/2 top-1/2 max-w-[1500px] -translate-x-1/2 -translate-y-1/2 rounded-[40px] bg-white px-16 py-10 shadow-[0_20px_80px_rgba(0,0,0,0.6)]">
                <span className="block truncate text-center font-game text-[120px] leading-none text-[#111]">{wheelLabel(d.targets[0])}</span>
              </motion.div>
            </>
          )}
        </Frame>
      );
    }
    return (
      <Frame>
        {/* Cards' own turn-spin has no prize to name (a card round's turn has none). */}
        {d.format !== "cards" && d.prize && (
          <p className="absolute inset-x-0 top-10 truncate px-16 text-center font-game text-4xl opacity-85 drop-shadow-[0_4px_16px_rgba(0,0,0,0.45)]">Drawing for {d.prize}</p>
        )}
        {targets.length > MAX_REELS
          ? <Cascade people={targets} endsAt={s.endsAt} now={now} />
          : <ReelFrames count={targets.length} />}
      </Frame>
    );
  }

  const winners = d.winners ?? [];
  if (s.phase !== "draw_reveal") return null;
  if (winners.length === 0) {
    return <Frame><div className="flex h-full items-center justify-center font-game text-7xl">No one left to draw</div></Frame>;
  }
  if (winners.length === 1) return <WinnerCard label="Winner" name={winners[0].name} company={winners[0].company} prize={d.prize} prizeImage={d.prizeImage} />;
  return <JointWinners title="Winners" winners={winners} prize={d.prize} prizeImage={d.prizeImage} />;
}

/**
 * The window round each 3D reel (D313, redesigned D323): a soft drop shadow that reads as a white
 * rounded box (no coloured ring, no glow, no red or brand lines) — the white comes from the 3D
 * reel's own white faces showing through, not a solid fill here: this HTML layer paints OVER the
 * 3D canvas (DisplayView stacks the HTML screen above Layer3D), so an opaque background here would
 * hide the spinning reel entirely instead of framing it. White-to-transparent gradients top and
 * bottom fade the names as they roll in and out, and two small dark-grey pointer triangles at the
 * left and right edges — level with the centre row — point inward at the winner. A small radius
 * (12px, fix round 1, D323): the 3D reel behind it is a plain rectangle with square corners, and a
 * bigger radius here (with the shadow it casts) visibly darkened the reel's own corners where they
 * showed past this frame's rounded clip. Frame itself is `relative` and fills the whole 1920×1080
 * screen, so `absolute inset-0` here still covers the whole canvas — the same pixels reelLayout and
 * the 3D reels use.
 */
function ReelFrames({ count }: { count: number }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {reelLayout(count).map((b, i) => (
        <div key={i} className="absolute overflow-hidden rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
          style={{ left: b.x - b.w / 2, top: b.y - b.h / 2, width: b.w, height: b.h }}>
          <div className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-white to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-white to-transparent" />
          <div className="absolute left-2 top-1/2 -translate-y-1/2"
            style={{ width: 0, height: 0, borderTop: "16px solid transparent", borderBottom: "16px solid transparent", borderLeft: "20px solid #3a3a3a" }} />
          <div className="absolute right-2 top-1/2 -translate-y-1/2"
            style={{ width: 0, height: 0, borderTop: "16px solid transparent", borderBottom: "16px solid transparent", borderRight: "20px solid #3a3a3a" }} />
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
