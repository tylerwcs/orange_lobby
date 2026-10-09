"use client";
import { useEffect, useRef } from "react";
import type { DisplayState } from "../../wire";
import type { Synth } from "../../sound";
import { celebrationDelay, emptyCelebration, showKey } from "../../views";

/**
 * The LED's sound cues that follow the stage (D301): countdown ticks and the horn, the last three
 * seconds of a question, the whoosh of a reveal or a mosaic round, the drumroll under a reel, and
 * the fanfare on a winner screen. Once per stage key (showKey: race results settling is not a
 * new screen), so a poll that changes nothing else never replays a sound. No fanfare over an
 * empty winner screen (emptyCelebration). The reels' clunks, the wheel's ticks and the card's lift and flip belong to
 * those scenes.
 */
export function useSoundCues(state: DisplayState, offset: number, synth: Synth) {
  const latest = useRef({ state, offset });
  useEffect(() => { latest.current = { state, offset }; });
  const key = showKey(state.stage.key);
  useEffect(() => {
    const { state: st, offset: off } = latest.current;
    const s = st.stage;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const now = Date.now() + off;
    const atServer = (ms: number, fn: () => void) => { if (ms - now >= -100) timers.push(setTimeout(fn, Math.max(0, ms - now))); };
    const after = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)); };
    switch (s.phase) {
      case "race_countdown":
        if (s.race) {
          for (let k = 3; k >= 1; k--) atServer(s.race.liveFrom - k * 1000, () => synth.play("tick"));
          atServer(s.race.liveFrom, () => synth.play("go"));
        }
        break;
      // Same delay confetti waits on (celebrationDelay), so the fanfare lands with the podium's rise.
      case "race_results": if (!emptyCelebration(st)) after(celebrationDelay(s.phase) ?? 0, () => synth.play("fanfare")); break;
      case "survival_question":
        if (s.question?.deadline) for (let k = 3; k >= 1; k--) atServer(s.question.deadline - k * 1000, () => synth.play("tick"));
        break;
      case "survival_reveal": after(1200, () => synth.play("whoosh")); break;
      case "survival_over": synth.play("fanfare"); break;
      case "draw_spinning": {
        const wheel = st.draw?.format === "wheel" && !st.draw.quick;
        if (s.endsAt && !wheel) synth.play("drumroll", s.endsAt - now);
        break;
      }
      case "draw_rounds": if ((st.draw?.mosaic?.round ?? 0) > 0) synth.play("whoosh"); break;
      case "draw_reveal": if (!emptyCelebration(st)) synth.play("fanfare"); break;
    }
    return () => timers.forEach(clearTimeout);
  }, [key, synth]);
}
