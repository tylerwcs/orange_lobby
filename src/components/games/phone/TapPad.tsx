"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

/**
 * The tap button (D269, D307). Taps are counted here and sent in a batch every second (D266); a
 * batch that fails is dropped, never replayed (D262). The last batch is sent when the race ends
 * and this unmounts, inside the server's 1.5 s grace. No counter (D304): every tap squashes the
 * button, bursts a ring and buzzes where the phone can.
 */
export function TapPad({ token, secondsLeft }: { token: string; secondsLeft: number }) {
  const pending = useRef(0);
  const nextRing = useRef(0);
  const [rings, setRings] = useState<number[]>([]);

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
    navigator.vibrate?.(10);
    const id = nextRing.current++;
    setRings((r) => [...r.slice(-7), id]);
  };

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <p className="font-game text-3xl">Tap tap tap!</p>
      <div className="relative flex size-72 items-center justify-center">
        <AnimatePresence>
          {rings.map((id) => (
            <motion.span key={id} aria-hidden initial={{ scale: 0.8, opacity: 0.7 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 0.5 }}
              onAnimationComplete={() => setRings((r) => r.filter((x) => x !== id))}
              className="absolute inset-0 rounded-full border-8 border-primary" />
          ))}
        </AnimatePresence>
        <motion.button type="button" onPointerDown={tap} onContextMenu={(e) => e.preventDefault()}
          whileTap={{ scale: 0.88 }} transition={{ type: "spring", stiffness: 600, damping: 18 }}
          className="relative flex size-64 select-none items-center justify-center rounded-full bg-primary font-game text-6xl text-primary-foreground shadow-[inset_0_-12px_0_rgba(0,0,0,0.25),0_16px_40px_rgba(0,0,0,0.3)]"
          style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}>
          TAP!
        </motion.button>
      </div>
      <p className="font-game text-2xl tabular-nums" suppressHydrationWarning>{secondsLeft}s left</p>
    </div>
  );
}
