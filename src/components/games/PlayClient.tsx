"use client";
import { useEffect, useRef, useState } from "react";
import type { PhoneState } from "@/lib/games/wire";
import type { PublicStage } from "@/lib/games/views";
import { OPTION_STYLES } from "@/lib/games/views";
import { phoneInterval } from "@/lib/games/poll";
import { Button } from "@/components/ui/button";
import { usePoll, useServerNow } from "./usePoll";

const phoneEvery = (s: PhoneState) => phoneInterval(s.stage?.phase ?? null);
const big = "h-16 w-full text-lg font-extrabold";
const SURVIVAL_PLAY = ["survival_question", "survival_locked", "survival_reveal", "survival_over"];

/**
 * The attendee's side of every game (D251). It follows the stage by polling (D256): once a
 * second while a game is on, every 5 s otherwise, sending its key so an unchanged stage costs
 * almost nothing. Joining answers with the fresh state, so the button changes at once.
 */
export function PlayClient({ token, initial }: { token: string; initial: PhoneState }) {
  const { state, offset, apply } = usePoll<PhoneState>(`/api/play/${token}/state`, initial, phoneEvery, true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const s = state.stage;
  const me = state.me;
  const ticking = !!s && (s.phase === "race_countdown" || s.phase === "race_live" || s.phase === "survival_question");
  const now = useServerNow(offset, 100, ticking);

  const join = async () => {
    setError(null);
    setJoining(true);
    try {
      const res = await fetch(`/api/play/${token}/join`, { method: "POST" });
      const body = await res.json().catch(() => ({ error: "Could not join. Try again." }));
      if (res.ok) apply(body as PhoneState);
      else setError((body as { error?: string }).error ?? "Could not join. Try again.");
    } catch {
      setError("Could not join. Check the connection and try again.");
    } finally {
      setJoining(false);
    }
  };

  if (!s || !me) return <Note>Loading…</Note>;
  const title = s.game?.title;
  const joinButton = (label: string) => (
    <Button className={big} onClick={join} disabled={joining}>{joining ? "Joining…" : label}</Button>
  );

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      {title && <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {s.phase === "idle" && <Note>No game on right now. Keep this page open — it switches on by itself when the host starts one.</Note>}

      {/* Tap race */}
      {me.kind === "race" && s.phase === "race_lobby" && (
        <>
          <p className="text-lg">You&apos;re racing for <b className="text-primary">{me.lane}</b></p>
          {me.joined ? <Note>You&apos;re in ✓ Get ready to tap!</Note> : joinButton("Join the race")}
        </>
      )}
      {me.kind === "race" && s.phase === "race_countdown" && s.race && (
        me.joined
          ? <p className="text-8xl font-extrabold tabular-nums" suppressHydrationWarning>{Math.max(1, Math.ceil((s.race.liveFrom - now) / 1000))}</p>
          : <Note>The race has started. Catch the next one!</Note>
      )}
      {me.kind === "race" && s.phase === "race_live" && s.race && (
        me.joined
          ? <TapPad token={token} initial={0} secondsLeft={Math.max(0, Math.ceil((s.race.liveUntil - now) / 1000))} />
          : <Note>The race has started. Catch the next one!</Note>
      )}
      {me.kind === "race" && s.phase === "race_results" && (
        me.joined && me.place
          ? <Note><b className="text-2xl">{me.lane} finished {ordinal(me.place)}</b><br />of {me.lanes}</Note>
          : <Note>Race over — see the screen for the results.</Note>
      )}

      {/* Last one standing */}
      {me.kind === "survival" && s.phase === "survival_lobby" && (
        me.joined ? <Note>You&apos;re in ✓ Watch the screen for question 1.</Note> : joinButton("I'm in")
      )}
      {me.kind === "survival" && SURVIVAL_PLAY.includes(s.phase) && (
        // Keyed by the question, so a new question starts with no local pick and no error.
        <SurvivalPlay key={s.question?.no ?? -1} token={token} stage={s} me={me} now={now} />
      )}

      {/* Lucky draw: no phone play (D277) */}
      {me.kind === "draw" && (
        me.won
          ? <Note><span className="text-5xl">🎉</span><br /><b className="text-2xl">You won {me.won}!</b><br />Come to the stage.</Note>
          : <Note>Lucky draw on stage — eyes on the screen!</Note>
      )}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="max-w-sm text-base text-muted-foreground">{children}</p>;
}

const SUFFIX: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? `${n}th` : `${n}${SUFFIX[n % 10] ?? "th"}`);

/**
 * The tap button (D269). Taps are counted here and sent in a batch every second (D266); a batch
 * that fails is dropped, never replayed (D262). The last batch is sent when the race ends and
 * this unmounts, inside the server's 1.5 s grace.
 */
function TapPad({ token, initial, secondsLeft }: { token: string; initial: number; secondsLeft: number }) {
  const [count, setCount] = useState(initial);
  const pending = useRef(0);

  useEffect(() => {
    const send = () => {
      const n = pending.current;
      if (!n) return;
      pending.current = 0;
      void fetch(`/api/play/${token}/taps`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n }), keepalive: true,
      }).catch(() => {});
    };
    const id = setInterval(send, 1000);
    return () => { clearInterval(id); send(); };
  }, [token]);

  const tap = () => {
    pending.current += 1;
    setCount((c) => c + 1);
    navigator.vibrate?.(8);
  };

  return (
    <>
      <p className="text-sm font-bold tabular-nums text-muted-foreground" suppressHydrationWarning>{secondsLeft}s left</p>
      <button
        type="button"
        onPointerDown={tap}
        onContextMenu={(e) => e.preventDefault()}
        className="flex size-64 select-none items-center justify-center rounded-full bg-primary text-5xl font-extrabold text-primary-foreground shadow-lg active:scale-95"
        style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
      >
        TAP!
      </button>
      <p className="text-3xl font-extrabold tabular-nums">{count}</p>
    </>
  );
}

type SurvivalMe = Extract<NonNullable<PhoneState["me"]>, { kind: "survival" }>;

/** One question of last one standing. The parent keys it by question number (see PlayClient). */
function SurvivalPlay({ token, stage, me, now }: { token: string; stage: PublicStage; me: SurvivalMe; now: number }) {
  const q = stage.question;
  const [picked, setPicked] = useState<number | null>(me.answered);
  const [error, setError] = useState<string | null>(null);

  if (!me.joined) return <Note>This game started without you. Watch the screen — the next one is yours!</Note>;
  const outBefore = me.outAt !== null && (q === null || me.outAt < q.no);
  if (stage.phase === "survival_over") {
    return me.outAt === null ? <Note><span className="text-5xl">🏆</span><br /><b className="text-2xl">You won!</b></Note> : <Note>Game over — see the screen for the winner.</Note>;
  }
  if (!q) return null;
  if (stage.phase === "survival_reveal") {
    if (outBefore) return <Note>You&apos;re out — watching.</Note>;
    return me.outAt === q.no
      ? <Note><span className="text-5xl">❌</span><br /><b className="text-2xl">You&apos;re out</b><br />Stay and watch who wins!</Note>
      : <Note><span className="text-5xl">✅</span><br /><b className="text-2xl">You&apos;re through!</b></Note>;
  }

  const answer = async (choice: number) => {
    setError(null);
    setPicked(choice);
    try {
      const res = await fetch(`/api/play/${token}/answer`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q.no, choice }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; choice?: number; error?: string };
      if (body.ok && typeof body.choice === "number") setPicked(body.choice);
      else { setPicked(null); setError(body.error ?? "That answer did not go through."); }
    } catch {
      setPicked(null);
      setError("That answer did not go through. Check the connection and try again.");
    }
  };
  const locked = stage.phase === "survival_locked" || picked !== null || outBefore;

  return (
    <div className="flex w-full flex-col gap-3">
      <p className="text-sm font-bold text-muted-foreground" suppressHydrationWarning>
        Question {q.no + 1} of {q.total}
        {stage.phase === "survival_question" && q.deadline ? ` · ${Math.max(0, Math.ceil((q.deadline - now) / 1000))}s` : ""}
      </p>
      <p className="text-xl font-extrabold">{q.text}</p>
      {outBefore && <Note>You&apos;re out — watching this one.</Note>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-1 gap-2">
        {q.options.map((o, i) => (
          <button key={i} type="button" disabled={locked} onClick={() => answer(i)}
            className={`flex min-h-16 items-center gap-3 rounded-xl px-4 text-left text-lg font-bold text-white transition-opacity ${locked && picked !== i ? "opacity-35" : ""}`}
            style={{ background: OPTION_STYLES[i].colour }}>
            <span className="text-2xl">{OPTION_STYLES[i].letter}</span>{o}
          </button>
        ))}
      </div>
      {picked !== null && <Note>Answer locked in — look at the screen.</Note>}
      {picked === null && stage.phase === "survival_locked" && !outBefore && <Note>Time&apos;s up.</Note>}
    </div>
  );
}
