"use client";
import { APP_NAME } from "@/lib/app-name";
import type { DisplayLane, DisplayState } from "@/lib/games/wire";
import { useServerNow } from "../usePoll";
import { Frame } from "./Frame";

type Race = NonNullable<DisplayState["race"]>;

/** The tap race on the LED (D268): lanes filling, 3-2-1, racing lanes, then the podium. */
export function RaceScreen({ state, offset }: { state: DisplayState; offset: number }) {
  const s = state.stage;
  const race = state.race!;
  const now = useServerNow(offset, 100, s.phase === "race_countdown" || s.phase === "race_live");
  const title = s.game?.title ?? "Tap race";

  if (s.phase === "race_lobby") {
    const players = race.lanes.reduce((n, l) => n + l.players, 0);
    return (
      <Frame title={title} right={`${players} ${players === 1 ? "player" : "players"}`}>
        <div className="flex h-full flex-col items-center justify-center gap-12">
          <p className="text-6xl font-extrabold">Open {APP_NAME} → Games and join!</p>
          <div className="flex max-w-[1700px] flex-wrap justify-center gap-4">
            {race.lanes.map((l) => (
              <div key={l.key} className="rounded-2xl bg-white/10 px-8 py-5 text-4xl font-bold">
                {l.label} <span className="opacity-60">· {l.players}</span>
              </div>
            ))}
          </div>
        </div>
      </Frame>
    );
  }

  if (s.phase === "race_countdown" && s.race) {
    const n = Math.max(1, Math.ceil((s.race.liveFrom - now) / 1000));
    return (
      <Frame title={title}>
        <div className="flex h-full items-center justify-center">
          <span key={n} className="countdown-pop text-[520px] font-extrabold leading-none text-[var(--brand)]" suppressHydrationWarning>{n}</span>
        </div>
      </Frame>
    );
  }

  if (s.phase === "race_live" && s.race) {
    return (
      <Frame title={title} right={`${Math.max(0, Math.ceil((s.race.liveUntil - now) / 1000))}s`}>
        <Lanes lanes={race.lanes} solo={race.solo} />
      </Frame>
    );
  }

  return (
    <Frame title={`${title} — results`}>
      <Podium lanes={race.lanes} solo={race.solo} mvp={race.mvp} />
    </Frame>
  );
}

/**
 * Lanes stay in a fixed order while racing so bars grow instead of rows jumping; the scale is
 * 110% of the leader so the leader never looks finished. Width eases over each 250 ms poll.
 */
function Lanes({ lanes }: { lanes: DisplayLane[]; solo: boolean }) {
  const ordered = [...lanes].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const row = Math.min(110, Math.floor(880 / Math.max(1, ordered.length)));
  const text = Math.min(44, row * 0.45);
  return (
    <ol className="flex flex-col gap-2">
      {ordered.map((l) => (
        <li key={l.key} className="flex items-center gap-6" style={{ height: row - 8 }}>
          <span className="w-[380px] truncate text-right font-bold" style={{ fontSize: text }}>{l.label}</span>
          <div className="relative h-full flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-300 ease-linear" style={{ width: `${l.progress * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Podium({ lanes, solo, mvp }: { lanes: DisplayLane[]; solo: boolean; mvp: Race["mvp"] }) {
  const [first, second, third] = lanes;
  const rest = lanes.slice(3, 12);
  const step = (l: DisplayLane | undefined, height: number, medal: string) =>
    l ? (
      <div className="flex w-[440px] flex-col items-center gap-4">
        <span className="text-7xl">{medal}</span>
        <span className="max-w-full truncate text-5xl font-extrabold">{l.label}</span>
        <div className="w-full rounded-t-3xl bg-[var(--brand)]" style={{ height }} />
      </div>
    ) : <div className="w-[440px]" />;
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-end justify-center gap-10">
        {step(second, 260, "🥈")}{step(first, 380, "🥇")}{step(third, 180, "🥉")}
      </div>
      <div className="flex items-center justify-between gap-8 pt-8 text-3xl">
        {/* Separate spans, not a joined string: HTML would collapse the spaces between places. */}
        <div className="flex min-w-0 gap-10 overflow-hidden whitespace-nowrap opacity-70">
          {rest.map((l) => <span key={l.key}>{l.place}. {l.label}</span>)}
        </div>
        {mvp && !solo && <span className="shrink-0">⚡ Fastest tapper: <b>{mvp.name}</b></span>}
      </div>
    </div>
  );
}
