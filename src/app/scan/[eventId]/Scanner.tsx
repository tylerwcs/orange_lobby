"use client";
import { PendingLink } from "@/components/PendingNav";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, ChevronLeft, CircleAlert, CircleCheck, CircleX, History, ScanBarcode, Search, Undo2, X, type LucideIcon } from "lucide-react";
import { checkInByTokenAction, checkInByIdAction, searchAttendeesAction, undoCheckinAction, type ScanResult, type SearchHit } from "./actions";
import type { Checkpoint } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { describeCameraError, type CameraProblem } from "@/lib/scan";
import { meterAriaMax, meterAriaValue, meterPercent } from "@/lib/meter";
import { shortTime } from "@/lib/text";
import { cn } from "@/lib/utils";
import { createWedgeReader } from "@/lib/wedge";

type Recent = { name: string; at: string; status: ScanResult["status"] };
type CameraState = { phase: "starting" | "ready" | "error"; problem?: CameraProblem };

const UNDO_SECONDS = 6;

/**
 * Camera, or a handheld scanner that types like a keyboard. Remembered per device, not per
 * event: it describes the hardware on this desk, and a registration laptop with a scanner on
 * a cable should open that way every time, on every event and through the crew link alike.
 */
type Mode = "camera" | "wedge";
const MODE_KEY = "scanner-mode";
const modeListeners = new Set<() => void>();
const readMode = (): Mode => {
  try { return localStorage.getItem(MODE_KEY) === "wedge" ? "wedge" : "camera"; } catch { return "camera"; }
};
const subscribeMode = (fn: () => void) => { modeListeners.add(fn); return () => { modeListeners.delete(fn); }; };
const writeMode = (m: Mode) => {
  try { localStorage.setItem(MODE_KEY, m); } catch { /* private mode: it falls back to the camera next time */ }
  modeListeners.forEach((fn) => fn());
};

/** Whether keystrokes reach this page at all: a hand scanner types into the focused window. */
const subscribeFocus = (fn: () => void) => {
  window.addEventListener("focus", fn); window.addEventListener("blur", fn);
  return () => { window.removeEventListener("focus", fn); window.removeEventListener("blur", fn); };
};

/** The ground each outcome is read off. Every pair here is asserted in tests/contrast.test.ts. */
const TONE: Record<ScanResult["status"], string> = {
  ok: "bg-success-soft text-success-strong",
  duplicate: "bg-warning-soft text-warning",
  undone: "bg-foreground text-background",
  notfound: "bg-destructive-soft text-destructive-strong",
  error: "bg-destructive-soft text-destructive-strong",
};

/** The solid band across the top of a result: white on the strong tone. Asserted in tests/contrast.test.ts. */
const BAND: Record<ScanResult["status"], string> = {
  ok: "bg-success-strong text-white",
  duplicate: "bg-warning text-white",
  undone: "bg-foreground text-background",
  notfound: "bg-destructive-strong text-white",
  error: "bg-destructive-strong text-white",
};

const ICON: Record<ScanResult["status"], LucideIcon> = {
  ok: CircleCheck,
  duplicate: History,
  undone: Undo2,
  notfound: CircleX,
  error: CircleAlert,
};

/** The recent list's marker for each outcome, the same hue as its band. */
const DOT: Record<Recent["status"], string> = {
  ok: "bg-success-strong",
  duplicate: "bg-warning",
  undone: "bg-foreground",
  notfound: "bg-destructive-strong",
  error: "bg-destructive-strong",
};

const LABEL: Record<ScanResult["status"], string> = {
  ok: "Checked in",
  duplicate: "Already in",
  undone: "Check-in undone",
  notfound: "Not on the list",
  error: "Not saved",
};

export function Scanner({ eventId, checkpoint, initialCount, total, crewToken }: { eventId: string; checkpoint: Checkpoint; initialCount: number; total: number; crewToken?: string }) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [count, setCount] = useState(initialCount);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [q, setQ] = useState(""); const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState<CameraState>({ phase: "starting" });
  const [undoLeft, setUndoLeft] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const busyRef = useRef(false);
  // Null on the server and for the first client render, so neither the camera nor the
  // keyboard listener starts until this device's own choice is known.
  const mode = useSyncExternalStore<Mode | null>(subscribeMode, readMode, () => null);
  // A scan that lands while the last one is still on its way. The camera can drop it — the
  // badge is still in front of the lens and reads again a moment later — but a hand scanner
  // fires once, so the one waiting runs next instead of vanishing.
  const queuedRef = useRef<string | null>(null);
  const focused = useSyncExternalStore(subscribeFocus, () => document.hasFocus(), () => true);

  const handle = useCallback(async (fn: () => Promise<ScanResult>) => {
    busyRef.current = true;
    setBusy(true);
    // Drop the previous result before awaiting. On venue wifi a round trip can outlast
    // the gap between two people at the door, and a stale "Checked in" left on screen
    // reads as this scan's result — the crew waves the next person through on the last
    // person's outcome, and nothing surfaces the mistake until the export is reconciled.
    setResult(null);
    setUndoLeft(0);
    try {
      const r = await fn();
      setResult(r);
      if (r.status === "ok") setCount((c) => c + 1);
      if (r.status === "undone") setCount((c) => Math.max(0, c - 1));
      if (r.attendee && r.status !== "error") setRecent((list) => [{ name: r.attendee!.name, at: new Date().toISOString(), status: r.status }, ...list].slice(0, 8));
      setUndoLeft(r.status === "ok" ? UNDO_SECONDS : 0);
      if (navigator.vibrate) navigator.vibrate(r.status === "ok" ? 100 : [80, 60, 80]);
    } catch {
      setResult({ status: "error", message: "The check-in didn't reach the server. Check the connection and scan again." });
    } finally { busyRef.current = false; setBusy(false); setHits([]); setQ(""); }
  }, []);

  /** One decoded code, from either the camera or the hand scanner. */
  const scanText = useCallback(async (first: string, queueIfBusy: boolean) => {
    if (busyRef.current) { if (queueIfBusy) queuedRef.current = first; return; }
    for (let text: string | null = first; text; text = queuedRef.current, queuedRef.current = null) {
      const now = Date.now();
      if (text === lastRef.current.text && now - lastRef.current.at < 3000) continue;
      lastRef.current = { text, at: now };
      const scanned = text;
      await handle(() => checkInByTokenAction(eventId, checkpoint.id, scanned, crewToken));
    }
  }, [eventId, checkpoint.id, handle, crewToken]);

  // No synchronous setState here: the initial state is already "starting", and Retry
  // resets it in the click handler before calling this again.
  const startCamera = useCallback(() => {
    let cancelled = false;
    // Dynamic import: Html5Qrcode touches `window`/`navigator` at module load, which
    // breaks `npm run build`'s prerender pass even though this component is "use client".
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (cancelled) return;
      const s = scannerRef.current ?? new Html5Qrcode("reader");
      scannerRef.current = s;
      s.start({ facingMode: "environment" }, { fps: 8, qrbox: 220 }, (text) => scanText(text, false), () => {})
        .then(() => { if (!cancelled) setCamera({ phase: "ready" }); })
        .catch((e) => { if (!cancelled) setCamera({ phase: "error", problem: describeCameraError(e) }); });
    });
    return () => { cancelled = true; };
  }, [scanText]);

  useEffect(() => {
    if (mode !== "camera") return;
    const cancel = startCamera();
    return () => {
      cancel();
      // stop() throws synchronously, not as a rejection, when the camera never got going
      // (permission refused, no camera) — and switching to the hand scanner must still work then.
      try { scannerRef.current?.stop().catch(() => {}); } catch { /* nothing was running */ }
    };
  }, [mode, startCamera]);

  // The hand scanner types into whatever has focus, so it is listened for on the whole
  // window rather than in a box that a stray click can take focus away from. A scan that
  // lands in the name search is still a scan: handle() clears the box once it is recorded.
  useEffect(() => {
    if (mode !== "wedge") return;
    const reader = createWedgeReader();
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing) return;
      const scanned = reader.feed(e.key, e.timeStamp);
      if (scanned === null) return;
      e.preventDefault(); // the Enter (or Tab) that ended it must not also act on the page
      void scanText(scanned, true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, scanText]);

  useEffect(() => {
    if (undoLeft <= 0) return;
    const t = setTimeout(() => setUndoLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [undoLeft]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setHits([]); return; }
      try {
        setHits(await searchAttendeesAction(eventId, q, checkpoint.id, crewToken));
      } catch {
        // A transport failure here must not leave a stale hit list on screen — a door
        // reading the previous search's results is how the wrong person gets checked in.
        setHits([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, eventId, checkpoint.id, crewToken]);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    if (m === "camera") setCamera({ phase: "starting" });
    writeMode(m);
  };

  const named = result?.attendee && result.status !== "error" && result.status !== "notfound";

  // The door is also the way back to the door list: one tap, where the thumb is. This
  // component serves two doors — an admin's session and a crew token — and each must land
  // back on its own chooser: sending a crew member into /scan's admin route would bounce
  // them to a login form they have no business seeing.
  const pickHref = crewToken ? `/crew/${crewToken}?pick=1` : `/scan/${eventId}?pick=1`;

  /*
    The outcome of the last scan: the one thing crew read, so it is built to be read from a
    step back. In hand-scanner mode it takes the whole main area — there is no camera to look
    at, and a desk laptop has the width — and in camera mode it sits beside the camera.

    A fixed minimum height, not a box that grows with its contents: when it collapsed back to
    one line between scans, the search field below jumped up under a thumb already reaching
    for it. Reserving the space buys a layout that never moves.
  */
  const hero = mode === "wedge";
  const StatusIcon = result ? ICON[result.status] : null;
  const outcome = (
    <section
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl",
        hero ? "min-h-72 flex-1 lg:min-h-[480px]" : "min-h-56",
        busy ? "bg-muted text-foreground"
          : result ? TONE[result.status]
          : hero && !focused ? "bg-warning-soft text-warning"
          : "border border-border bg-card text-muted-foreground",
      )}
    >
      {result && <span className="sr-only">{count} of {total} checked in.</span>}

      {busy && (
        <div className="flex flex-1 items-center justify-center gap-3">
          <Spinner className={hero ? "size-7" : "size-5"} />
          <span className={cn("font-extrabold", hero ? "text-3xl" : "text-lg")}>Checking…</span>
        </div>
      )}

      {!busy && !result && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          {hero && <ScanBarcode className={cn("size-14", focused ? "text-primary" : "")} aria-hidden="true" />}
          {!hero ? (
            <p className="text-base">Point the camera at a badge, or search by name below.</p>
          ) : focused ? (
            <>
              <p className="text-3xl font-extrabold text-foreground lg:text-4xl">Ready — scan a badge</p>
              <p className="max-w-sm text-base">It checks in straight away. Badge won&apos;t scan? Search by name instead.</p>
            </>
          ) : (
            // Scans typed while another window has focus go to that window, so the panel says
            // so rather than looking ready while every badge is lost. Any click on the page
            // brings the keyboard back.
            <>
              <p className="text-3xl font-extrabold lg:text-4xl">Scanner paused</p>
              <p className="max-w-sm text-base">Another window has the keyboard, so scans go there. Click anywhere on this page to bring them back.</p>
            </>
          )}
        </div>
      )}

      {result && !busy && StatusIcon && (
        <>
          {/* The outcome as a solid band: colour and word together, so it reads at a glance
              and does not rest on colour alone. */}
          <div className={cn("flex items-center gap-3", BAND[result.status], hero ? "px-6 py-4 lg:px-8" : "px-4 py-3")}>
            <StatusIcon className={hero ? "size-8" : "size-6"} aria-hidden="true" />
            <p className={cn("font-extrabold", hero ? "text-2xl lg:text-3xl" : "text-xl")}>{LABEL[result.status]}</p>
            {result.status === "duplicate" && result.earlier && (
              <p className={cn("ml-auto font-semibold tabular-nums", hero ? "text-lg" : "text-sm")}>since {shortTime(result.earlier.at)}</p>
            )}
          </div>
          <div className={cn("flex flex-1 flex-col", hero ? "gap-6 p-6 lg:p-8" : "gap-3 p-4")}>
            {named
              ? <p className={cn("font-extrabold leading-[1.05] tracking-tight text-balance", hero ? "text-4xl lg:text-6xl" : "text-3xl")}>{result.attendee!.name}</p>
              : <p className={cn("font-bold leading-snug text-balance", hero ? "text-2xl lg:text-3xl" : "text-lg")}>{result.message}</p>}
            {named && result.fields && result.fields.some((f) => f.value) && (
              <dl className={cn("grid gap-x-6", hero ? "grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-y-4" : "grid-cols-2 gap-y-2")}>
                {result.fields.filter((f) => f.value).map((f) => (
                  <div key={f.label} className="min-w-0">
                    <dt className={cn("font-semibold opacity-80", hero ? "text-base" : "text-sm")}>{f.label}</dt>
                    <dd className={cn("font-extrabold break-words", hero ? "text-2xl lg:text-3xl" : "text-lg")}>{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {result.status === "ok" && undoLeft > 0 && (
              <Button type="button" variant="outline" disabled={busy}
                className={cn("mt-auto w-fit border-current/30 bg-transparent font-bold text-current hover:bg-background/60", hero ? "h-12 px-5 text-base" : "h-11 px-4")}
                onClick={() => handle(() => undoCheckinAction(eventId, checkpoint.id, result.attendee!.id, crewToken))}>
                <Undo2 data-icon="inline-start" />
                Undo · {undoLeft}s
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-3 p-3 lg:max-w-7xl lg:gap-5 lg:p-6">
      {/* One row at desk width — the door, how badges are read, and how full the room is. On
          a phone the count stays beside the door name, where it always was, and the rest wraps. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_minmax(12rem,18rem)] lg:gap-x-6">
        {/* A link, styled as a button: it navigates, so it stays an <a>. Base UI's Button
            would announce it as a button and take open-in-new-tab away from the crew.
            PendingLink is still an <a>; it only adds the skeleton while the list loads. */}
        <PendingLink href={pickHref} className={cn(buttonVariants({ variant: "ghost" }), "-ml-2 h-11 w-fit max-w-full gap-1 px-2 text-base font-extrabold lg:text-lg")}>
          <ChevronLeft data-icon="inline-start" />
          <span className="truncate">{checkpoint.name}</span>
        </PendingLink>
        <p className="flex shrink-0 items-baseline gap-1.5 lg:order-3">
          <span className="text-2xl font-extrabold leading-none tabular-nums lg:text-3xl">{count}</span>
          <span className="text-xs font-semibold text-muted-foreground lg:text-sm">of {total} in</span>
        </p>
        {/* At the door the real question is how many are still to come, so the count gets a
            length as well as a number. Green to agree with what a check-in means everywhere else. */}
        <Progress
          value={Math.round(meterPercent(count, total))}
          className="col-span-2 lg:order-4 lg:col-span-1 [&_[data-slot=progress-indicator]]:bg-success-strong"
          aria-label={`${count} of ${total} checked in at ${checkpoint.name}`}
          aria-valuenow={meterAriaValue(count, total)}
          aria-valuemin={0}
          aria-valuemax={meterAriaMax(total)}
        />
        <div role="group" aria-label="How badges are read" className="col-span-2 flex w-fit gap-1 rounded-lg bg-muted p-1 lg:order-2 lg:col-span-1">
          {([["camera", "Camera", Camera], ["wedge", "Hand scanner", ScanBarcode]] as const).map(([m, label, Icon]) => (
            <Button key={m} type="button" size="sm" variant={mode === m ? "outline" : "ghost"} aria-pressed={mode === m}
              onClick={() => switchMode(m)} className={cn("h-9 gap-1.5 px-3", mode === m ? "bg-background shadow-sm" : "text-muted-foreground")}>
              <Icon data-icon="inline-start" />{label}
            </Button>
          ))}
        </div>
      </header>

      {/* Below lg this is one column in reading order. At lg it splits: the main area on the
          left (the camera, or in hand-scanner mode the outcome itself) and a rail on the right
          for everything crew reach for by hand — search and the recent list. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-stretch lg:gap-5">
        <div className="flex flex-col gap-3">
          {/* The camera box keeps its measurements: html5-qrcode sizes the video itself, and the
              crew are trained on this frame. Hidden rather than unmounted in hand-scanner mode:
              html5-qrcode keeps hold of the #reader element, and switching back must find it. */}
          <div className={cn("relative min-h-[240px] overflow-hidden rounded-2xl bg-foreground lg:min-h-[480px]", hero && "hidden")}>
            <div id="reader" />
            {camera.phase === "starting" && (
              <p className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-background/70">Starting camera…</p>
            )}
            {camera.phase === "error" && camera.problem && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-background">
                <CameraOff className="size-7 text-background/70" />
                <p className="text-lg font-extrabold">{camera.problem.title}</p>
                <p className="text-sm text-background/70">{camera.problem.hint}</p>
                <Button type="button" variant="secondary" className="mt-2 h-11 px-4" onClick={() => { setCamera({ phase: "starting" }); startCamera(); }}>Retry camera</Button>
              </div>
            )}
          </div>
          {hero && outcome}
        </div>

        <div className="flex flex-col gap-3">
          {!hero && outcome}

          <div>
            <label htmlFor="scan-search" className="sr-only">Search attendees by name or email</label>
            <InputGroup className="h-12 bg-card">
              <InputGroupAddon><Search /></InputGroupAddon>
              <InputGroupInput
                id="scan-search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search"
                placeholder="Search name or email" className="h-12 text-base"
              />
              {/* Badges do not always scan, and the next person is waiting: clearing a search has to
                  be one tap rather than a held backspace. */}
              {q.length > 0 && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="icon-sm" aria-label="Clear search" onClick={() => setQ("")}><X /></InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
          </div>

          {hits.length > 0 && (
            <ul className="flex flex-col gap-2">
              {hits.map((h) => (
                <li key={h.id}>
                  <Button variant="outline" disabled={busy} onClick={() => handle(() => checkInByIdAction(eventId, checkpoint.id, h.id, crewToken))}
                    className="h-auto min-h-14 w-full justify-start gap-3 px-4 py-2.5 text-left">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-bold">{h.name}</span>
                      <span className="truncate text-xs font-normal text-muted-foreground">{[h.category, h.table_no ? `Table ${h.table_no}` : null].filter(Boolean).join(" · ")}</span>
                    </span>
                    {h.checkedIn ? <Badge variant="success">Already in</Badge> : <Badge>Check in</Badge>}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {q.trim().length >= 2 && hits.length === 0 && !busy && (
            <Empty className="border border-dashed py-6">
              <EmptyHeader>
                <EmptyTitle>No one matches &ldquo;{q.trim()}&rdquo;</EmptyTitle>
                <EmptyDescription>Try a shorter name, or the email they registered with.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {recent.length > 0 && (
            <section className="mt-2 flex flex-col gap-2">
              <h2 className="text-sm font-bold text-muted-foreground">Recent</h2>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-sm">
                {recent.map((r, i) => (
                  // Eight at desk width, where the rail has the room; four on a phone, where
                  // the list would push everything else off the screen.
                  <li key={`${r.at}-${i}`} className={cn("flex items-center gap-3 px-3.5 py-2.5", i >= 4 && "hidden lg:flex")}>
                    <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", DOT[r.status])} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{r.status === "undone" ? "undone" : r.status === "duplicate" ? "already in" : "in"} · {shortTime(r.at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
