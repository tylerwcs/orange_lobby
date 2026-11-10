"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { QrCode, X } from "lucide-react";
import { toast } from "@/lib/toast-store";
import { lockBodyScroll } from "@/lib/scroll-lock";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { coverColour, type PassportTest, type SaveResult, type TestPick } from "@/features/passport-test/client";
import { isLanded } from "../../../lib/passport-live";
import type { Passport, Reveal } from "../../../lib/booths";
import { chopInk } from "../paper";
import { useLive } from "../PassportLive";
import { PassportQr } from "../PassportQr";
import { bookStart, bookStep } from "./flow";
import { answerAt, inBox, NAME_BUTTON, NAME_FIELD, PAGE } from "./geometry";
import { spreadFor, useFontsVersion, useImages, type BookStamp, type PageData } from "./pages";
import { stampSpot } from "./stamp-spots";
import { BOOK_FONTS, loadBookFonts } from "./fonts";
import { FlatBook } from "./FlatBook";
import { BookA11y } from "./BookA11y";
import { BookBar, BOOK_BUTTON } from "./BookBar";
import { hasWebGL, prefersReducedMotion } from "./webgl";
import type { BookSceneApi } from "./BookScene";

// D889: three.js only reaches phones that open a passport, and only after the WebGL check.
const BookScene = dynamic(() => import("./BookScene"), { ssr: false });

const REVEAL_MS = 1800;
const PICK_HOLD_MS = 260;
const BANNER_MS = 3500;
const RELEASE_AFTER_REVEAL_MS = 2200;
const RELEASE_AFTER_OPENING_MS = 450;
const RELEASE_AFTER_OPENING_3D_MS = 2900;
const noSubscribe = () => () => {};

/** Words and round buttons on the book's stage, which is always dark whatever the theme. */
const ON_STAGE = "text-white/85"; // theme-fixed: the book's own dark stage, like the polaroid camera
const STAGE_ROUND = "flex size-11 items-center justify-center rounded-full bg-white/12 text-white ring-1 ring-white/25 backdrop-blur"; // theme-fixed: on the dark stage

function barQrButton(open: () => void) {
  return <button type="button" className={BOOK_BUTTON} onClick={open}><QrCode aria-hidden className="size-5" />Show my QR</button>;
}

function cornerQrButton(open: () => void) {
  return <button type="button" aria-label="Show my QR" className={STAGE_ROUND} onClick={open}><QrCode aria-hidden className="size-5" /></button>;
}

/**
 * D870: the guest's passport, the whole screen like the polaroid camera (D482): no back link,
 * cover or title, × to the portal home. The closed portrait passport opens (D871), one page per
 * question (D872), the name page (D874), the reveal filling in the holder page (D875), and the
 * stamps on the page above (D877) with Show my QR and Booths underneath (D879). A passport without
 * a test opens straight to the holder page with the name only (D881).
 *
 * The book sits under every dialog, sheet and the stamp reveal (all z-50) and over the portal's
 * own bars (z-40 at most), so the QR, the Booths sheet and a stamp's arrival all play on top.
 */
export function PassportBook(p: {
  slug: string;
  token: string;
  activityId: string;
  eventName: string;
  brand: string | null;
  qr: string;
  showQr: boolean;
  passport: Passport;
  test: PassportTest;
  result: { personalityId: string; holderName: string } | null;
  registeredName: string;
  isOpen: boolean;
  /** D880: stamps given before the test, played right after the reveal. */
  afterTest: Reveal[];
  reward: string | null;
  about: ReactNode;
  /** Steadies where this guest's stamps land (D877). */
  seed: string;
  /** "That's me": the save action, bound to this guest and passport on the server. */
  save: (input: { picks: TestPick[]; holderName: string }) => Promise<SaveResult>;
}) {
  const router = useRouter();
  const live = useLive();
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  const home = `/e/${p.slug}/a/${p.token}`;
  const withResult = p.test.on ? p.result : null;

  const [flow, dispatch] = useReducer(bookStep, undefined, () =>
    bookStart({ testOn: p.test.on, questions: p.test.questions.length, hasResult: !!withResult, isOpen: p.isOpen }));
  const [holderName, setHolderName] = useState(withResult?.holderName ?? p.registeredName);
  const [personalityId, setPersonalityId] = useState(withResult?.personalityId ?? null);
  const [progress, setProgress] = useState(withResult || !p.test.on ? 1 : 0);
  const [banner, setBanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [released, setReleased] = useState(flow.stage === "done");
  const [celebrate, setCelebrate] = useState(false);
  // Stamps a booth gave mid-test (D880): state for the stamp page, a ref for the reveal's end.
  const [waiting, setWaiting] = useState<Reveal[]>([]);
  const waitingRef = useRef<Reveal[]>([]);
  useEffect(() => { waitingRef.current = waiting; }, [waiting]);
  const stageRef = useRef(flow.stage);
  useEffect(() => { stageRef.current = flow.stage; }, [flow.stage]);

  // D870, D889: the 3D book where the phone can draw it and motion is welcome; the flat book
  // otherwise, if the 3D one fails, and while it loads.
  const can3d = useSyncExternalStore(noSubscribe, () => hasWebGL() && !prefersReducedMotion(), () => false);
  const [failed3d, setFailed3d] = useState(false);
  const [ready3d, setReady3d] = useState(false);
  const use3d = can3d && !failed3d;
  const sceneApi = useRef<BookSceneApi | null>(null);
  const [nameRect, setNameRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [topRect, setTopRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // The whole screen is the passport: the portal page behind it never scrolls (as the polaroid camera, D482).
  useEffect(() => lockBodyScroll(), []);

  const { img, prefetch, version } = useImages();
  const fontsVersion = useFontsVersion();
  useEffect(() => { void loadBookFonts(); }, []);

  const personality = p.test.on ? p.test.personalities.find((x) => x.id === personalityId) ?? null : null;

  // D889: the next two questions' pictures load while the guest answers this one; the characters
  // and the crest are small and load at once.
  useEffect(() => {
    prefetch([p.test.cover.crest, ...p.test.personalities.map((x) => x.picture)]);
  }, [p.test, prefetch]);
  useEffect(() => {
    prefetch(p.test.questions.slice(flow.index, flow.index + 3).map((q) => q.image));
  }, [flow.index, p.test.questions, prefetch]);

  // What sits on the stamp page: stamps already in, minus any still waiting for their reveal.
  const stamps: BookStamp[] = useMemo(() => {
    const queued = new Set(live.state.queue.map((r) => r.stampId));
    const held = released ? new Set<string>() : new Set([...p.afterTest, ...waiting].map((r) => r.stampId));
    return p.passport.cells
      .filter((c) => (c.stampId && c.stampedAt ? !queued.has(c.stampId) && !held.has(c.stampId) : isLanded(live.state, c.booth.id)))
      .sort((a, b) => (a.stampedAt ? Date.parse(a.stampedAt) : Infinity) - (b.stampedAt ? Date.parse(b.stampedAt) : Infinity))
      .map((c) => ({ id: c.booth.id, image: c.booth.stamp_image_url, name: c.booth.name }));
  }, [p.passport, p.afterTest, waiting, live.state, released]);

  const paintFlow = useMemo(
    () => (flash && flow.stage === "questions" ? { ...flow, picks: flow.picks.map((x, i) => (i === flow.index ? flash : x)) } : flow),
    [flow, flash],
  );
  const data: PageData = useMemo(() => ({
    test: p.test, eventName: p.eventName, coverColour: coverColour(p.test, p.brand), crest: p.test.cover.crest,
    flow: paintFlow, holderName, personality, revealProgress: progress, stamps, seed: p.seed,
    chop: chopInk(p.brand), fonts: BOOK_FONTS, paintName: flow.stage !== "name",
  }), [p.test, p.eventName, p.brand, p.seed, paintFlow, holderName, personality, progress, stamps, flow.stage]);

  // A stamp a booth gives mid-test waits for the reveal (D880); afterwards it plays at once.
  const onArrived = useCallback((found: Reveal[]) => {
    if (stageRef.current === "done") { live.arrived(found); return; }
    setWaiting((w) => [...w, ...found]);
    const last = found[found.length - 1]?.stampedAt;
    if (last) live.passed(last);
    toast("Stamp collected. It's waiting on your stamp page.");
  }, [live]);

  const pick = useCallback((answerId: string) => {
    if (flash || flow.stage !== "questions") return;
    if (prefersReducedMotion()) { dispatch({ type: "pick", answerId }); return; }
    setFlash(answerId);
    setTimeout(() => { dispatch({ type: "pick", answerId }); setFlash(null); }, PICK_HOLD_MS);
  }, [flash, flow.stage]);

  // The finished holder page (D875). The stamps that waited play once it has been seen (below).
  const revealed = useRef(false);
  const completeReveal = useCallback(() => {
    revealed.current = true;
    setProgress(1);
    dispatch({ type: "revealed" });
  }, []);

  // D880: stamps that waited - given before the test, or before the cover was opened - play one
  // by one once the finished pages are on screen: after the reveal has had its moment, or after
  // the cover's opening. Let go and queued in the same tick, so none shows on the page first.
  useEffect(() => {
    if (flow.stage !== "done" || released) return;
    const wait = prefersReducedMotion() ? 0 : revealed.current ? RELEASE_AFTER_REVEAL_MS : use3d ? RELEASE_AFTER_OPENING_3D_MS : RELEASE_AFTER_OPENING_MS;
    const t = setTimeout(() => {
      const held = [...p.afterTest, ...waitingRef.current].sort((a, b) => Date.parse(a.stampedAt) - Date.parse(b.stampedAt));
      setReleased(true);
      setWaiting([]);
      if (held.length) live.arrived(held);
    }, wait);
    return () => clearTimeout(t);
  }, [flow.stage, released, p.afterTest, live, use3d]);

  const finish = useCallback(async () => {
    if (saving || flow.stage !== "name") return;
    setSaving(true);
    const picks = p.test.questions.map((q, i) => ({ questionId: q.id, answerId: flow.picks[i] ?? "" }));
    let r: SaveResult;
    try {
      r = await p.save({ picks, holderName });
    } catch {
      r = { ok: false, reason: "busy" };
    }
    setSaving(false);
    if (!r.ok) {
      if (r.reason === "closed") dispatch({ type: "closed" });
      else if (r.reason === "off") { toast("The personality test was switched off.", "error"); router.refresh(); }
      else toast("Something went wrong. Try again.", "error");
      return;
    }
    setPersonalityId(r.personalityId);
    setHolderName(r.holderName);
    setBanner(true);
    if (prefersReducedMotion()) { completeReveal(); return; }
    setProgress(0);
    dispatch({ type: "reveal" });
  }, [saving, flow, p, holderName, router, completeReveal]);

  // D875: the holder page fills itself in over about 1.8 s, then `completeReveal`.
  useEffect(() => {
    if (flow.stage !== "revealing") return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / REVEAL_MS);
      setProgress(t);
      if (t < 1) raf = requestAnimationFrame(step); else completeReveal();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [flow.stage, completeReveal]);

  useEffect(() => {
    if (!banner || flow.stage !== "done") return;
    const t = setTimeout(() => setBanner(false), BANNER_MS);
    return () => clearTimeout(t);
  }, [banner, flow.stage]);

  // Goal 10: the card filling up gets one moment with the organiser's reward message.
  const [wasComplete, setWasComplete] = useState(p.passport.complete);
  if (p.passport.complete !== wasComplete) {
    setWasComplete(p.passport.complete);
    if (p.passport.complete) setCelebrate(true);
  }

  const onTop = () => dispatch({ type: "back" });
  const onBottom = (u: number, v: number) => {
    if (flow.stage === "closed") dispatch({ type: "open" });
    else if (flow.stage === "questions") {
      const j = answerAt(u, v);
      const a = j === null ? null : p.test.questions[flow.index]?.answers[j];
      if (a) pick(a.id);
    } else if (flow.stage === "name" && inBox(u, v, NAME_BUTTON)) void finish();
  };

  // D878: the reveal lands on the spot the next stamp takes - a hidden slot StampReveal flies to -
  // then the passport takes a small press as the stamp is pressed in.
  const landing = flow.stage === "done" ? live.state.queue[0] ?? null : null;
  const spot = landing ? stampSpot(stamps.length, p.seed) : null;
  const slot = (place: CSSProperties) => landing && spot ? (
    <div data-booth-slot={landing.boothId} aria-hidden className="pointer-events-none absolute" style={place}>
      <div data-slot-face data-deg={(spot.rot * 180) / Math.PI} className="absolute inset-0" />
    </div>
  ) : null;
  const stampSize = spot ? 230 * spot.scale : 0;
  const flatSlot = spot ? slot({
    left: `${((spot.x - stampSize / 2) / PAGE.w) * 100}%`, top: `${((spot.y - stampSize / 2) / PAGE.h) * 100}%`,
    width: `${(stampSize / PAGE.w) * 100}%`, aspectRatio: "1",
  }) : null;
  const sceneSlot = spot && topRect ? slot({
    left: topRect.left + (topRect.width * (spot.x - stampSize / 2)) / PAGE.w, top: topRect.top + (topRect.height * (spot.y - stampSize / 2)) / PAGE.h,
    width: (topRect.width * stampSize) / PAGE.w, height: (topRect.width * stampSize) / PAGE.w,
  }) : null;
  const [pressed, setPressed] = useState({ count: stamps.length, n: 0 });
  if (stamps.length !== pressed.count) setPressed({ count: stamps.length, n: stamps.length > pressed.count && released ? pressed.n + 1 : pressed.n });

  const qr = (variant: "bar" | "corner") => (
    <PassportQr slug={p.slug} token={p.token} activityId={p.activityId} qr={p.qr} after={live.after}
      paused={live.state.queue.length > 0} onArrived={onArrived} trigger={variant === "bar" ? barQrButton : cornerQrButton} />
  );

  // D874: the name field over the name page - in page percentages on the flat book, in screen
  // pixels from the scene's projection on the 3D one. A long name shrinks to stay in the box.
  const shrink = 18 / Math.max(18, Array.from(holderName).length);
  const nameInput = (place: CSSProperties) => (
    <input
      aria-label="Name on your passport" value={holderName} maxLength={40} autoComplete="name" enterKeyHint="done"
      onChange={(e) => setHolderName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void finish(); }}
      onClick={(e) => e.stopPropagation()}
      className="absolute bg-transparent text-center text-[#3B2A18] outline-none placeholder:text-[#9A7B52] focus-visible:bg-white/30" /* theme-fixed: ink on the cream page */
      style={{ fontFamily: BOOK_FONTS.hand, fontWeight: 600, ...place }}
    />
  );
  const flatName = flow.stage === "name" ? nameInput({
    left: `${(NAME_FIELD.x / PAGE.w) * 100}%`, top: `${(NAME_FIELD.y / PAGE.h) * 100}%`,
    width: `${(NAME_FIELD.w / PAGE.w) * 100}%`, height: `${(NAME_FIELD.h / PAGE.h) * 100}%`,
    fontSize: `${6.4 * shrink}cqw`,
  }) : null;
  const sceneName = flow.stage === "name" && nameRect ? nameInput({
    left: nameRect.left + (nameRect.width * NAME_FIELD.x) / PAGE.w, top: nameRect.top + (nameRect.height * NAME_FIELD.y) / PAGE.h,
    width: (nameRect.width * NAME_FIELD.w) / PAGE.w, height: (nameRect.height * NAME_FIELD.h) / PAGE.h,
    fontSize: nameRect.width * 0.064 * shrink,
  }) : null;

  const stage = (
    <div /* theme-fixed: the book's own dark stage, like the polaroid camera */ className="fixed inset-0 z-[45] flex h-dvh touch-none flex-col overflow-hidden overscroll-none text-white"
      style={{ background: `radial-gradient(120% 80% at 50% 25%, ${data.coverColour} 0%, #0B0F18 85%)` }}>
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="size-11">{p.showQr && (flow.stage === "questions" || flow.stage === "name") ? qr("corner") : null}</div>
        {(flow.stage === "questions" || flow.stage === "name") && (
          <div className="flex flex-1 items-center gap-3 px-4" aria-hidden>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20" /* theme-fixed: on the book's dark stage */>
              <div className="h-full rounded-full bg-white/90 transition-[width] duration-300" /* theme-fixed: on the book's dark stage */
                style={{ width: `${((flow.stage === "name" ? flow.picks.length : flow.index) / Math.max(1, flow.picks.length)) * 100}%` }} />
            </div>
            <span className={`text-xs font-bold tabular-nums ${ON_STAGE}`}>{flow.stage === "name" ? "Name" : `${flow.index + 1}/${flow.picks.length}`}</span>
          </div>
        )}
        <button type="button" aria-label="Close passport" onClick={() => router.push(home)} className={STAGE_ROUND}>
          <X aria-hidden className="size-5" />
        </button>
      </div>

      <div className={`relative flex min-h-0 flex-1 flex-col items-center gap-4 px-4 ${use3d && ready3d ? "justify-between pb-2" : "justify-center"}`}>
        {use3d && (
          // Unseen and untouchable until its first frame: the flat book shows (and takes taps) till then.
          <div className={`absolute inset-0 transition-opacity duration-300 ${ready3d ? "" : "pointer-events-none opacity-0"}`}
            onClick={(e) => {
              const h = sceneApi.current?.hit(e.clientX, e.clientY);
              if (h?.page === "top") onTop(); else if (h) onBottom(h.u, h.v);
            }}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              sceneApi.current?.lean(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2);
            }}
            onPointerLeave={() => sceneApi.current?.lean(0, 0)}>
            <BookScene data={data} img={img} repaint={version + fontsVersion} banner={banner} api={sceneApi} press={pressed.n}
              onNameRect={setNameRect} onTopRect={setTopRect} onReady={() => setReady3d(true)} onFail={() => setFailed3d(true)} />
            {sceneName}
            {sceneSlot}
          </div>
        )}
        {/* Above the 3D layer (absolute, so it would paint over plain flow): the banner's slot keeps its height there. */}
        {(banner || (use3d && ready3d)) && (
          <div className="pointer-events-none relative z-10 flex min-h-[60px] flex-col items-center">
            {banner && personality && (
              <div className="flex flex-col items-center motion-safe:animate-[book-banner_400ms_ease-out]" aria-hidden>
                <span className={`text-xs font-bold uppercase tracking-[0.3em] ${ON_STAGE}`}>You&apos;re a</span>
                <span className="rounded-full px-5 py-1 text-2xl tracking-wide" style={{ background: personality.colour, fontFamily: BOOK_FONTS.display }}>
                  {personality.name}
                </span>
              </div>
            )}
          </div>
        )}
        {!(use3d && ready3d) && (
          <FlatBook spread={spreadFor(flow)} data={data} img={img} repaint={version + fontsVersion}
            onTop={onTop} onBottom={onBottom} overlay={flatName} topOverlay={flatSlot} press={pressed.n} />
        )}
        <div className="pointer-events-none relative z-10 flex min-h-5 flex-col items-center gap-1">
          {flow.stage === "closed" && <p className={`text-sm font-semibold ${ON_STAGE}`}>Tap to open your passport</p>}
          {flow.stage === "locked" && <p className={`max-w-xs text-center text-base font-semibold ${ON_STAGE}`}>{flow.closedMessage}</p>}
          {flow.stage === "questions" && <p className={`text-xs ${ON_STAGE}`}>{flow.index > 0 ? "Tap an answer. Tap the top page to go back." : "Tap an answer."}</p>}
          {saving && <p className={`text-sm ${ON_STAGE}`} role="status">Saving…</p>}
        </div>
      </div>

      {flow.stage === "done" && (
        <BookBar passport={p.passport} qrButton={p.showQr ? qr("bar") : null} reward={p.reward} about={p.about}
          closedNote={!p.isOpen && !p.passport.complete ? "Stamping opens soon." : null} />
      )}

      <BookA11y flow={flow} test={p.test} personality={personality} holderName={holderName} stamps={stamps.length} saving={saving}
        onOpen={() => dispatch({ type: "open" })} onPick={pick} onBack={onTop} onFinish={() => void finish()} />

      <Dialog open={celebrate} onOpenChange={setCelebrate}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle className="text-center">Passport complete!</DialogTitle>
          <DialogDescription className="text-center">{p.reward ?? "Every stamp collected."}</DialogDescription>
        </DialogContent>
      </Dialog>
    </div>
  );

  return inBrowser ? createPortal(stage, document.body) : stage;
}
