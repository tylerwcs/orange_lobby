"use client";
import { AnimatePresence, motion } from "motion/react";
import { APP_NAME } from "@/lib/app-name";
import type { DisplayLane, DisplayState } from "@/lib/games/wire";
import { useServerNow } from "../usePoll";
import { Frame } from "./Frame";
import { TimerRing } from "./TimerRing";

type Race = NonNullable<DisplayState["race"]>;
const spring = { type: "spring", stiffness: 260, damping: 20 } as const;
const climb = { type: "spring", stiffness: 90, damping: 18 } as const;

/** The tap race on the LED (D268, D303–D305): lanes filling, 3-2-1-GO, vertical lanes, the podium. No tap counts (D304). */
export function RaceScreen({ state, offset }: { state: DisplayState; offset: number }) {
  const s = state.stage;
  const race = state.race!;
  const now = useServerNow(offset, 100, s.phase === "race_countdown" || s.phase === "race_live");

  if (s.phase === "race_lobby") return <Lobby lanes={race.lanes} />;

  if (s.phase === "race_countdown" && s.race) {
    const n = Math.max(1, Math.ceil((s.race.liveFrom - now) / 1000));
    return (
      <Frame>
        <div className="flex h-full items-center justify-center">
          <AnimatePresence mode="popLayout">
            <motion.span key={n} initial={{ scale: 2.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring}
              className="font-game text-[480px] leading-none text-white drop-shadow-[0_0_60px_var(--brand)]" suppressHydrationWarning>{n}</motion.span>
          </AnimatePresence>
        </div>
      </Frame>
    );
  }

  if (s.phase === "race_live" && s.race) {
    const left = Math.max(0, (s.race.liveUntil - now) / 1000);
    const sinceGo = now - s.race.liveFrom;
    return (
      <Frame>
        {/* The one corner element left (Requirement 1): a graphic, not text. Inset to match
            Frame's own px-16/pt-10 padding, since absolute children measure from the padding box. */}
        <div className="absolute right-16 top-10"><TimerRing left={left} total={s.race.duration_s} /></div>
        <div className="relative h-full">
          <Lanes lanes={race.lanes} />
          <AnimatePresence>
            {sinceGo < 900 && (
              <motion.div key="go" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 2, opacity: 0 }}
                className="pointer-events-none absolute inset-0 flex items-center justify-center font-game text-[300px] text-white drop-shadow-[0_0_50px_var(--brand)]">GO!</motion.div>
            )}
          </AnimatePresence>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <Podium lanes={race.lanes} solo={race.solo} mvp={race.mvp} />
    </Frame>
  );
}

/** Lanes as cards, with each lane's latest joiners popping in (D305). The player count is not a tap count. */
function Lobby({ lanes }: { lanes: DisplayLane[] }) {
  const players = lanes.reduce((n, l) => n + l.players, 0);
  return (
    <Frame>
      <div className="flex h-full flex-col items-center gap-8">
        <motion.p animate={{ scale: [1, 1.04, 1] }} transition={{ repeat: Infinity, duration: 1.8 }} className="font-game text-7xl drop-shadow-[0_6px_24px_rgba(0,0,0,0.5)]">Join on your phone!</motion.p>
        <p className="-mt-4 text-4xl opacity-85">{players} {players === 1 ? "player" : "players"}</p>
        <p className="-mt-2 text-3xl opacity-80">Open {APP_NAME} → Games</p>
        <div className="flex max-w-[1760px] flex-wrap justify-center gap-5">
          {lanes.map((l) => (
            <motion.div layout key={l.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="w-[330px] rounded-3xl bg-black/40 p-5 ring-2 ring-white/15 backdrop-blur-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-game text-3xl">{l.label}</span>
                <span className="text-2xl tabular-nums opacity-70">{l.players}</span>
              </div>
              <div className="mt-4 flex min-h-12 flex-wrap gap-2">
                <AnimatePresence>
                  {l.initials.map((ini, i) => (
                    <motion.span key={`${ini}-${i}`} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring}
                      className="flex size-12 items-center justify-center rounded-full bg-[var(--brand)] text-lg font-extrabold">{ini}</motion.span>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/**
 * Vertical lanes racing bottom to top (D303), in a fixed order so columns grow instead of
 * swapping. The leader's column glows and wears a crown. Heights come from `progress`, which is
 * already scaled to 110% of the leader (progressOf), so nobody looks finished.
 */
function Lanes({ lanes }: { lanes: DisplayLane[] }) {
  const ordered = [...lanes].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const lead = lanes.reduce<DisplayLane | null>((best, l) => (l.progress > 0 && (!best || l.progress > best.progress) ? l : best), null);
  return (
    // pt-[200px] clears the TimerRing (right-16 top-10, ~40–190px): with Frame's header gone,
    // lanes start level with it, and with 9+ lanes the row fills wide enough for the rightmost
    // lane/crown to run under the ring (fix round 1, D323).
    <div className="flex h-full items-stretch justify-center gap-5 px-6 pt-[200px]">
      {ordered.map((l) => {
        const leader = lead?.key === l.key;
        return (
          <div key={l.key} className="flex min-w-0 max-w-[150px] flex-1 flex-col items-center gap-3">
            <div className="relative w-full flex-1 rounded-[32px] bg-white/10">
              <motion.div className="absolute inset-x-0 bottom-0 rounded-[32px] bg-[var(--brand)]" initial={false}
                animate={{ height: `${l.progress * 100}%` }} transition={climb}
                style={{ boxShadow: leader ? "0 0 48px var(--brand)" : "none" }} />
              <motion.div className="absolute inset-x-0 flex justify-center" initial={false}
                animate={{ bottom: `calc(${l.progress * 100}% - 8px)` }} transition={climb}>
                <span className={`flex size-16 items-center justify-center rounded-full bg-white text-3xl shadow-xl ${leader ? "ring-8 ring-white/40" : ""}`}>{leader ? "👑" : "🏃"}</span>
              </motion.div>
            </div>
            <span className="w-full truncate text-center font-game text-2xl">{l.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The podium rises 3rd, then 2nd, then 1st (D305); confetti follows from the 3D layer (celebrationDelay). */
function Podium({ lanes, solo, mvp }: { lanes: DisplayLane[]; solo: boolean; mvp: Race["mvp"] }) {
  const [first, second, third] = lanes;
  const rest = lanes.slice(3, 12);
  const step = (l: DisplayLane | undefined, height: number, medal: string, delay: number) =>
    l ? (
      <div className="flex w-[440px] flex-col items-center gap-4">
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring, delay: delay + 0.4 }} className="text-8xl">{medal}</motion.span>
        <motion.span initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay + 0.3 }} className="max-w-full truncate font-game text-6xl">{l.label}</motion.span>
        <motion.div initial={{ height: 0 }} animate={{ height }} transition={{ type: "spring", stiffness: 120, damping: 16, delay }}
          className="w-full rounded-t-3xl bg-[var(--brand)] shadow-[0_0_60px_var(--brand)]" />
      </div>
    ) : <div className="w-[440px]" />;
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-end justify-center gap-10">
        {step(second, 280, "🥈", 0.5)}{step(first, 400, "🥇", 1.0)}{step(third, 190, "🥉", 0)}
      </div>
      <div className="flex items-center justify-between gap-8 pt-8 text-3xl">
        {/* Separate spans, not a joined string: HTML would collapse the spaces between places. */}
        <div className="flex min-w-0 gap-10 overflow-hidden whitespace-nowrap opacity-75">
          {rest.map((l) => <span key={l.key}>{l.place}. {l.label}</span>)}
        </div>
        {mvp && !solo && <span className="shrink-0">⚡ Fastest tapper: <b>{mvp.name}</b></span>}
      </div>
    </div>
  );
}
