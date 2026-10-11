"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
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

type Stage = "camera" | "ejecting" | "editing" | "posting" | "posted";
type Photo = { file: File; url: string; width: number; height: number };

const EJECT_MS = 1300;
/** Where the camera sits, and its film slot within it (Camera's fixed sizes). */
const CAMERA_TOP = 112;
const SLOT_IN_CAMERA = 300;
const SLOT_Y = CAMERA_TOP + SLOT_IN_CAMERA;
const PRINT_TOP = 16;

const onResize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const fitWidth = () => Math.min(340, window.innerWidth - 48);

/**
 * The instant-camera composer (D482), for portal attendees and walk-ins alike: snap or choose a
 * photo, the print ejects and develops, write on it, decorate it, post it. `start` and `post` are
 * server actions bound to who is posting; everything they refuse is shown as it is said.
 */
export function PolaroidComposer({ prompt, stickers, start, post }: {
  prompt: string;
  stickers: StickerDef[];
  start: () => Promise<StartResult>;
  post: (input: PostInput) => Promise<PostResult>;
}) {
  const router = useRouter();
  const width = useSyncExternalStore(onResize, fitWidth, () => 320);
  const [stage, setStage] = useState<Stage>("camera");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [message, setMessage] = useState("");
  const [placed, setPlaced] = useState<StickerPlacement[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  useEffect(() => {
    if (retryAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [retryAt]);

  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  const wait = retryAt === null ? 0 : Math.max(0, Math.ceil((retryAt - now) / 1000));
  const srcs = Object.fromEntries(stickers.map((s) => [s.id, s.src]));
  const ratio = photo ? cardRatio(photo.width, photo.height) : 1.2;
  const cardH = width * ratio;
  const editing = stage === "editing" || stage === "posting";
  const controlsTop = PRINT_TOP + cardH + 28;

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
      setStage("ejecting");
      later(() => setStage("editing"), EJECT_MS);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const refused = (r: Refusal) => {
    setError(r.error);
    if (r.wait) {
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
      className={`${handFont.variable} relative overflow-hidden rounded-3xl bg-zinc-950 px-4 text-white`}
      style={{ minHeight: editing ? controlsTop + 190 : CAMERA_TOP + 440 }}
      onPointerDown={(e) => { if (!(e.target as HTMLElement).closest("[data-sticker]")) setSelected(null); }}>
      <p className="absolute inset-x-4 top-8 flex h-[72px] -rotate-2 items-center justify-center text-center text-4xl transition-opacity duration-500"
        style={{ fontFamily: "var(--font-hand)", fontWeight: 700, opacity: editing ? 0 : 1 }}>
        {stage === "posted" ? "It's on the wall!" : prompt}
      </p>

      <motion.div className="absolute left-1/2" style={{ top: CAMERA_TOP, marginLeft: -150 }}
        animate={stage === "camera" || stage === "posted" ? { opacity: 1, scale: 1, filter: "blur(0px)" } : { opacity: 0.3, scale: 0.92, filter: "blur(4px)" }}
        transition={{ duration: 0.8 }}>
        <Camera onShoot={() => input.current?.click()} disabled={stage !== "camera"} flash={stage === "ejecting"} />
      </motion.div>

      <AnimatePresence>
        {card && stage !== "posted" && (
          <motion.div key="print" className="absolute z-20" style={{ left: `calc(50% - ${width / 2}px)`, width }}
            initial={{ top: SLOT_Y }} animate={{ top: stage === "ejecting" ? SLOT_Y : PRINT_TOP }}
            exit={{ top: -cardH - 80, rotate: 8, opacity: 0, transition: { duration: 0.7, ease: "easeIn" } }}
            transition={{ duration: 0.7, ease: "easeOut" }}>
            {/* While ejecting, everything above the slot is clipped, so the print slides out of it. */}
            <div className={stage === "ejecting" ? "overflow-hidden" : ""} style={{ height: cardH + 24 }}>
              <motion.div initial={{ y: -cardH }} animate={{ y: 0 }} transition={{ duration: EJECT_MS / 1000, ease: [0.22, 1, 0.36, 1] }}>
                <PolaroidCard card={card} width={width} stickerSrc={srcs} developing hideMessage={editing}>
                  {editing && (
                    <>
                      <MessageField width={width} ratio={ratio} value={message} onChange={setMessage} disabled={stage === "posting"} />
                      <StickerLayer placed={placed} onChange={setPlaced} selected={selected} onSelect={setSelected} width={width} ratio={ratio} srcs={srcs} />
                    </>
                  )}
                </PolaroidCard>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {editing && (
        <div className="absolute inset-x-4 z-30 flex flex-col items-center gap-3" style={{ top: controlsTop }}>
          {error && <p role="alert" className="w-full max-w-[340px] rounded-lg bg-red-500/15 px-3 py-2 text-center text-sm text-red-100">{error}</p>}
          <div className="flex w-full max-w-[340px] justify-between text-xs text-white/60">
            <span>{messageLength(message)}/{MAX_MESSAGE}</span>
            <span>{placed.length}/{MAX_STICKERS} stickers</span>
          </div>
          <div className="flex w-full max-w-[340px] gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setTrayOpen(true)} disabled={stage === "posting"}>Stickers</Button>
            <Button type="button" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={reset} disabled={stage === "posting"}>Cancel</Button>
          </div>
          <Button type="button" size="lg" className="w-full max-w-[340px]" onClick={() => void send()} disabled={stage === "posting" || wait > 0}>
            {stage === "posting" ? "Posting…" : wait > 0 ? `You can post again in ${wait} s` : "Post to wall"}
          </Button>
        </div>
      )}
      {!editing && error && (
        <p role="alert" className="absolute inset-x-4 z-30 text-center text-sm text-red-200" style={{ top: CAMERA_TOP + 390 }}>{error}</p>
      )}

      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      <StickerTray open={trayOpen} onOpenChange={setTrayOpen} stickers={stickers} onPick={addSticker} />
    </section>
  );
}
