"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera } from "lucide-react";
import { usePoll } from "@/lib/use-poll";
import { useWakeLock } from "@/lib/use-wake-lock";
import { handFont } from "../../font";
import { cardRatio } from "../../lib/card";
import type { WallBackground } from "../../lib/settings";
import type { WallState } from "../../lib/wire";
import { PolaroidCard } from "../PolaroidCard";
import { createWallEngine } from "./engine";

const every = () => 2000;
const onResize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const viewportKey = () => `${window.innerWidth}x${window.innerHeight}`;

/** The LED polaroid wall (D484): alternating looping columns, spotlights, the walk-in QR. */
export function WallClient({ token, initial }: { token: string; initial: WallState }) {
  const { state } = usePoll<WallState>(`/api/wall/${token}/state`, initial, every, true);
  const [engine] = useState(createWallEngine);
  const sizeKey = useSyncExternalStore(onResize, viewportKey, () => "1920x1080");
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const [started, setStarted] = useState(false);
  useWakeLock(started);

  useEffect(() => {
    const [w, h] = sizeKey.split("x").map(Number);
    engine.update(state, { w, h });
  }, [engine, state, sizeKey]);
  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, [engine]);

  const [vw, vh] = sizeKey.split("x").map(Number);
  const spot = snap.spotlight;
  const spotRatio = spot ? cardRatio(spot.card.w, spot.card.h) : 1;
  const spotW = spot ? Math.min(vw * 0.4, (vh * 0.8) / spotRatio) : 0;

  const start = () => {
    setStarted(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className={`${handFont.variable} fixed inset-0 overflow-hidden bg-[#0d0d10] text-white ${started ? "cursor-none" : ""}`}>
      <Backdrop background={state.background} brand={state.brand} />

      {snap.columns.map((col, i) => (
        <div key={i} className="absolute top-0 h-full" style={{ left: col.x, width: snap.colW }}>
          <div ref={(el) => engine.setTrack(i, el)} className="absolute inset-x-0 top-0 will-change-transform">
            {col.slots.map((s) => (
              <div key={s.key} className="absolute transition-[top,opacity] duration-700 ease-out"
                style={{ top: s.top, left: (snap.colW - snap.cardW) / 2, opacity: s.fading ? 0 : 1 }}>
                <PolaroidCard card={s.card} width={snap.cardW} stickerSrc={state.stickerSrc} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="pointer-events-none absolute inset-0 z-30 bg-black/45 backdrop-blur-sm transition-opacity duration-700" style={{ opacity: spot ? 1 : 0 }} />
      <AnimatePresence>
        {spot && (
          <motion.div key={spot.card.id} className="absolute left-1/2 top-1/2 z-40"
            style={{ width: spotW, marginLeft: -spotW / 2, marginTop: -(spotW * spotRatio) / 2 }}
            initial={{ y: vh * 0.6, scale: 0.5, rotate: -10, opacity: 0 }}
            animate={{ y: 0, scale: 1, rotate: 2, opacity: 1 }}
            exit={{
              x: spot.column * snap.colW + snap.colW / 2 - vw / 2, y: 0, scale: snap.cardW / spotW, rotate: spot.card.tilt, opacity: 0,
              transition: { duration: 0.9, ease: "easeInOut" },
            }}
            transition={{ type: "spring", stiffness: 110, damping: 18 }}>
            <PolaroidCard card={{ ...spot.card, tilt: 0 }} width={spotW} stickerSrc={state.stickerSrc} developing />
          </motion.div>
        )}
      </AnimatePresence>

      {state.cards.length === 0 && !spot && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-[2vh] text-center">
          <Camera className="size-[14vh] opacity-80" strokeWidth={1.25} />
          <p className="text-[7vh] leading-none" style={{ fontFamily: "var(--font-hand)", fontWeight: 700 }}>Be the first on the wall</p>
        </div>
      )}

      {state.qr && (
        <div className="absolute bottom-[3vh] right-[2vw] z-20 flex items-center gap-[1.2vh] rounded-[1.6vh] bg-white p-[1.2vh] text-black shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.qr} alt="" className="size-[16vh]" />
          <div className="pr-[1vh] text-[2.6vh] font-extrabold leading-tight">Scan to<br />share</div>
        </div>
      )}

      {!started && (
        <button type="button" onClick={start}
          className="absolute inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-4 bg-black/85">
          <span className="text-5xl font-extrabold">Click to start display</span>
          <span className="text-xl opacity-70">Goes full screen and keeps the screen awake.</span>
        </button>
      )}
    </div>
  );
}

/** The admin's image (SVG too, only ever through <img>) or a muted looping video; otherwise the event's colour. */
function Backdrop({ background, brand }: { background: WallBackground | null; brand: string | null }) {
  if (background?.type === "video") {
    return <video className="absolute inset-0 size-full object-cover" src={background.url} autoPlay muted loop playsInline />;
  }
  if (background?.type === "image") {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={background.url} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-black/30" />
      </>
    );
  }
  const c = brand ?? "#f97316";
  return (
    <div className="absolute inset-0"
      style={{ background: `radial-gradient(120% 90% at 20% 10%, color-mix(in oklab, ${c} 45%, transparent), transparent 60%), linear-gradient(160deg, #0d0d10 0%, color-mix(in oklab, ${c} 30%, #0d0d10) 100%)` }} />
  );
}
