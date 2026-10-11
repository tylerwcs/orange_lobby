"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { browserStorage } from "@/lib/supabase/browser";
import { POLAROID_BUCKET } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { handFont } from "../font";
import { cardRatio } from "../lib/card";
import { checkMessage, MAX_MESSAGE, messageLength } from "../lib/message";
import { MAX_STICKERS, newPlacement, type StickerPlacement } from "../lib/placement";
import type { StickerDef } from "../lib/stickers";
import type { PostInput, PostResult, Refusal, StartResult } from "../lib/post-types";
import { Camera } from "./Camera";
import { MessageField } from "./MessageField";
import { PolaroidCard } from "./PolaroidCard";
import { StickerLayer } from "./StickerLayer";
import { StickerTray } from "./StickerTray";
import { preparePhoto } from "./prepare-photo";
import {
  CAMERA_H, CAMERA_W, DEFAULT_STAGE, EDGE, BAR_H, PRINT_SLACK, PROMPT_H, stageLayout, type StageBox,
} from "../lib/stage-layout";
import { exitFullscreen, lockBodyScroll } from "./stage";
import { STAGE_BG, StageGlow } from "./StageBackdrop";

type Stage = "camera" | "ejecting" | "editing" | "posting" | "posted";
type Photo = { file: File; url: string; width: number; height: number };

const EJECT_MS = 1300;

/**
 * The instant-camera composer (D482), for portal attendees and walk-ins alike: a full-screen stage
 * where you snap or choose a photo, the print ejects and develops, you write on it, decorate it and
 * post it. `start` and `post` are server actions bound to who is posting; everything they refuse
 * is shown as it is said. While it is open the page behind does not scroll. `onClose` adds a close
 * button, focused on open, and Escape closes too: the portal opens the stage over its page, while
 * the walk-in page is the stage. Until it has measured itself the stage is laid out for a typical
 * phone, so the server's HTML already shows the camera on a slow connection.
 */
export function PolaroidComposer({ prompt, stickers, start, post, brand, eventName, onClose }: {
  prompt: string;
  stickers: StickerDef[];
  start: () => Promise<StartResult>;
  post: (input: PostInput) => Promise<PostResult>;
  /** The event's colour, for the glow behind the camera. */
  brand?: string | null;
  /** A small line above the prompt, where the page has no other heading (the walk-in page). */
  eventName?: string;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("camera");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [message, setMessage] = useState("");
  const [placed, setPlaced] = useState<StickerPlacement[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [box, setBox] = useState<StageBox>(DEFAULT_STAGE);
  const input = useRef<HTMLInputElement>(null);
  const stageBox = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);
  /** The "You can post again in N s." message on screen, so only that one is cleared when the wait ends. */
  const waitError = useRef<string | null>(null);

  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); }, []);
  // The page behind stays put while the stage is open, and full screen ends with it.
  useEffect(() => lockBodyScroll(), []);
  useEffect(() => () => exitFullscreen(), []);
  // A closable stage is a dialog: its close button takes focus, and Escape closes it, unless the
  // sticker tray (which Escape closes first) is open or a post is on its way.
  const closable = !!onClose;
  useEffect(() => { if (closable) closeButton.current?.focus(); }, [closable]);
  const onEscape = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented || !onClose || trayOpen || stage === "posting") return;
    onClose();
  });
  useEffect(() => {
    if (!closable) return;
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [closable]);
  // Everything is placed from the stage's own size, inside the safe area.
  useEffect(() => {
    const el = stageBox.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  useEffect(() => {
    if (retryAt === null) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      // The wait is over: drop the countdown's message, and with `retryAt` the interval stops.
      if (t >= retryAt) {
        setRetryAt(null);
        setError((e) => (e !== null && e === waitError.current ? null : e));
      }
    }, 250);
    return () => clearInterval(id);
  }, [retryAt]);

  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  const wait = retryAt === null ? 0 : Math.max(0, Math.ceil((retryAt - now) / 1000));
  const srcs = Object.fromEntries(stickers.map((s) => [s.id, s.src]));
  const ratio = photo ? cardRatio(photo.width, photo.height) : 1.2;
  const editing = stage === "editing" || stage === "posting";
  const at = stageLayout(box, !!eventName, closable, ratio);

  const reset = () => {
    setPhoto(null); setMessage(""); setPlaced([]); setSelected(null); setError(null); setTrayOpen(false); setStage("camera");
  };

  const pick = async (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    setError(null);
    try {
      const p = await preparePhoto(file);
      setPhoto({ ...p, url: URL.createObjectURL(p.file) });
      // The shutter: the stage flashes and the phone buzzes (iOS has no vibrate).
      navigator.vibrate?.(30);
      setStage("ejecting");
      later(() => setStage("editing"), EJECT_MS);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const refused = (r: Refusal) => {
    setError(r.error);
    if (r.wait) {
      waitError.current = r.error;
      setRetryAt(Date.now() + r.wait * 1000);
      setNow(Date.now());
    }
    setStage("editing");
  };

  const send = async () => {
    if (!photo || wait > 0) return;
    const check = checkMessage(message);
    if (!check.ok) { setError(check.error); return; }
    setError(null); setSelected(null); setRetryAt(null); setStage("posting");
    try {
      const s = await start();
      if (!s.ok) return refused(s);
      const { error: upload } = await browserStorage().storage.from(POLAROID_BUCKET)
        .uploadToSignedUrl(s.path, s.token, photo.file, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (upload) return refused({ ok: false, error: "That photo didn't upload. Check your connection and try again." });
      const r = await post({ path: s.path, width: photo.width, height: photo.height, message: check.message, stickers: placed });
      if (!r.ok) return refused(r);
      setStage("posted");
      router.refresh();
      later(reset, 2600);
    } catch {
      refused({ ok: false, error: "Something went wrong. Check your connection and try again." });
    }
  };

  const addSticker = (id: string) => {
    setTrayOpen(false);
    if (placed.length >= MAX_STICKERS) { setError(`Use up to ${MAX_STICKERS} stickers.`); return; }
    setPlaced([...placed, newPlacement(id, ratio)]);
    setSelected(placed.length);
  };

  const card = photo ? { src: photo.url, w: photo.width, h: photo.height, message, stickers: editing ? [] : placed, tilt: 0 } : null;

  return (
    <section
      role={onClose ? "dialog" : undefined} aria-modal={onClose ? true : undefined} aria-label={onClose ? "Camera" : undefined}
      className={`${handFont.variable} fixed inset-0 z-[100] h-dvh overflow-hidden overscroll-none text-white`}
      style={{ background: STAGE_BG }}
      // Only a first touch deselects: a second finger landing off the sticker is part of a pinch.
      onPointerDown={(e) => { if (e.isPrimary && !(e.target as HTMLElement).closest("[data-sticker]")) setSelected(null); }}>
      <div className="absolute inset-0"
        style={{ padding: "env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)" }}>
        <div ref={stageBox} className="relative size-full">
          <StageGlow brand={brand} y={at.cameraTop + (CAMERA_H * at.k) / 2} size={CAMERA_W * at.k * 2.2} />
          {eventName && (
            <p className="absolute inset-x-12 truncate text-center text-xs font-bold uppercase tracking-widest text-white/50 transition-opacity duration-500"
              style={{ top: EDGE, opacity: editing ? 0 : 1 }}>
              {eventName}
            </p>
          )}
          <p className={`absolute ${onClose ? "inset-x-12" : "inset-x-4"} flex -rotate-2 items-center justify-center text-center text-4xl transition-opacity duration-500`}
            style={{ top: at.promptTop, height: PROMPT_H, fontFamily: "var(--font-hand)", fontWeight: 700, opacity: editing ? 0 : 1 }}>
            {stage === "posted" ? "It's on the wall!" : prompt}
          </p>

          <motion.div className="absolute" style={{ left: at.cameraLeft, top: at.cameraTop, width: CAMERA_W * at.k, height: CAMERA_H * at.k }}
            animate={stage === "camera" || stage === "posted" ? { opacity: 1, scale: 1, filter: "blur(0px)" } : { opacity: 0.3, scale: 0.92, filter: "blur(4px)" }}
            transition={{ duration: 0.8 }}>
            {/* Camera keeps its fixed 300 px design, scaled with the phone. */}
            <div style={{ width: CAMERA_W, transform: `scale(${at.k})`, transformOrigin: "top left" }}>
              <Camera onShoot={() => input.current?.click()} disabled={stage !== "camera"} flash={stage === "ejecting"} />
            </div>
          </motion.div>

          <AnimatePresence>
            {card && stage !== "posted" && (
              <motion.div key="print" className="absolute z-20" style={{ left: `calc(50% - ${at.width / 2}px)`, width: at.width }}
                initial={{ top: at.slotY }} animate={{ top: stage === "ejecting" ? at.slotY : at.printTop }}
                exit={{ top: -at.cardH - 80, rotate: 8, opacity: 0, transition: { duration: 0.7, ease: "easeIn" } }}
                transition={{ duration: 0.7, ease: "easeOut" }}>
                {/* While ejecting, everything above the slot is clipped, so the print slides out of it. */}
                <div className={stage === "ejecting" ? "overflow-hidden" : ""} style={{ height: at.cardH + PRINT_SLACK }}>
                  <motion.div initial={{ y: -at.cardH }} animate={{ y: 0 }} transition={{ duration: EJECT_MS / 1000, ease: [0.22, 1, 0.36, 1] }}>
                    <PolaroidCard card={card} width={at.width} stickerSrc={srcs} developing hideMessage={editing}>
                      {editing && (
                        <>
                          <MessageField width={at.width} ratio={ratio} value={message} onChange={setMessage} disabled={stage === "posting"} />
                          <StickerLayer placed={placed} onChange={setPlaced} selected={selected} onSelect={setSelected} width={at.width} ratio={ratio} srcs={srcs} />
                        </>
                      )}
                    </PolaroidCard>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {editing && (
            <>
              {error && (
                <div className="absolute inset-x-4 z-30 flex justify-center pb-1" style={{ bottom: BAR_H }}>
                  <p role="alert" className="w-full max-w-[360px] rounded-lg bg-red-500/15 px-3 py-2 text-center text-sm text-red-100">{error}</p>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center justify-end gap-3 px-4 pb-4" style={{ height: BAR_H }}>
                <div className="flex w-full max-w-[360px] justify-between text-xs text-white/60">
                  <span>{messageLength(message)}/{MAX_MESSAGE}</span>
                  <span>{placed.length}/{MAX_STICKERS} stickers</span>
                </div>
                <div className="flex w-full max-w-[360px] gap-2">
                  <Button type="button" variant="secondary" className="flex-1" onClick={() => setTrayOpen(true)} disabled={stage === "posting"}>Stickers</Button>
                  <Button type="button" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={reset} disabled={stage === "posting"}>Cancel</Button>
                </div>
                <Button type="button" size="lg" className="h-11 w-full max-w-[360px] text-base" onClick={() => void send()} disabled={stage === "posting" || wait > 0}>
                  {stage === "posting" ? "Posting…" : wait > 0 ? `You can post again in ${wait} s` : "Post to wall"}
                </Button>
              </div>
            </>
          )}
          {!editing && error && (
            <p role="alert" className="absolute inset-x-4 bottom-4 z-30 text-center text-sm text-red-200">{error}</p>
          )}

          {onClose && (
            <button ref={closeButton} type="button" aria-label="Close camera" onClick={onClose} disabled={stage === "posting"}
              className="absolute left-1 top-1 z-50 flex size-11 items-center justify-center rounded-full bg-white/10 text-white outline-none backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-40">
              <X aria-hidden className="size-5" />
            </button>
          )}
        </div>
      </div>

      {/* The shutter's flash, over the whole screen. */}
      <AnimatePresence>
        {stage === "ejecting" && (
          <motion.div key="flash" aria-hidden className="pointer-events-none absolute inset-0 z-40 bg-white"
            initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} />
        )}
      </AnimatePresence>

      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      <StickerTray open={trayOpen} onOpenChange={setTrayOpen} stickers={stickers} onPick={addSticker} />
    </section>
  );
}
