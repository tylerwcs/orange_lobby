"use client";
import { PendingLink } from "@/components/PendingNav";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { CameraOff, ChevronLeft, Search, Undo2, X } from "lucide-react";
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

type Recent = { name: string; at: string; status: ScanResult["status"] };
type CameraState = { phase: "starting" | "ready" | "error"; problem?: CameraProblem };

const UNDO_SECONDS = 6;

/** The ground each outcome is read off. Every pair here is asserted in tests/contrast.test.ts. */
const TONE: Record<ScanResult["status"], string> = {
  ok: "bg-success-soft text-success-strong",
  duplicate: "bg-warning-soft text-warning",
  undone: "bg-foreground text-background",
  notfound: "bg-destructive-soft text-destructive-strong",
  error: "bg-destructive-soft text-destructive-strong",
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
      if (r.attendee && r.status !== "error") setRecent((list) => [{ name: r.attendee!.name, at: new Date().toISOString(), status: r.status }, ...list].slice(0, 4));
      setUndoLeft(r.status === "ok" ? UNDO_SECONDS : 0);
      if (navigator.vibrate) navigator.vibrate(r.status === "ok" ? 100 : [80, 60, 80]);
    } catch {
      setResult({ status: "error", message: "The check-in didn't reach the server. Check the connection and scan again." });
    } finally { busyRef.current = false; setBusy(false); setHits([]); setQ(""); }
  }, []);

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
      s.start({ facingMode: "environment" }, { fps: 8, qrbox: 220 }, async (text) => {
        if (busyRef.current) return;
        const now = Date.now();
        if (text === lastRef.current.text && now - lastRef.current.at < 3000) return;
        lastRef.current = { text, at: now };
        await handle(() => checkInByTokenAction(eventId, checkpoint.id, text, crewToken));
      }, () => {})
        .then(() => { if (!cancelled) setCamera({ phase: "ready" }); })
        .catch((e) => { if (!cancelled) setCamera({ phase: "error", problem: describeCameraError(e) }); });
    });
    return () => { cancelled = true; };
  }, [eventId, checkpoint.id, handle, crewToken]);

  useEffect(() => {
    const cancel = startCamera();
    return () => { cancel(); scannerRef.current?.stop().catch(() => {}); };
  }, [startCamera]);

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

  const named = result?.attendee && result.status !== "error" && result.status !== "notfound";

  // The door is also the way back to the door list: one tap, where the thumb is. This
  // component serves two doors — an admin's session and a crew token — and each must land
  // back on its own chooser: sending a crew member into /scan's admin route would bounce
  // them to a login form they have no business seeing.
  const pickHref = crewToken ? `/crew/${crewToken}?pick=1` : `/scan/${eventId}?pick=1`;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-3 p-3 lg:max-w-5xl lg:gap-4 lg:p-6">
      <header className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          {/* A link, styled as a button: it navigates, so it stays an <a>. Base UI's Button
              would announce it as a button and take open-in-new-tab away from the crew.
              PendingLink is still an <a>; it only adds the skeleton while the list loads. */}
          <PendingLink href={pickHref} className={cn(buttonVariants({ variant: "ghost" }), "-ml-2 h-11 gap-1 px-2 text-base font-extrabold")}>
            <ChevronLeft data-icon="inline-start" />
            <span className="truncate">{checkpoint.name}</span>
          </PendingLink>
          <p className="flex shrink-0 items-baseline gap-1.5">
            <span className="text-2xl font-extrabold leading-none tabular-nums">{count}</span>
            <span className="text-xs font-semibold text-muted-foreground">of {total} in</span>
          </p>
        </div>
        {/* At the door the real question is how many are still to come, so the count gets a
            length as well as a number. Green to agree with what a check-in means everywhere else. */}
        <Progress
          value={Math.round(meterPercent(count, total))}
          className="[&_[data-slot=progress-indicator]]:bg-success-strong"
          aria-label={`${count} of ${total} checked in at ${checkpoint.name}`}
          aria-valuenow={meterAriaValue(count, total)}
          aria-valuemin={0}
          aria-valuemax={meterAriaMax(total)}
        />
      </header>

      {/* Below lg this is just another flex-col in the stack — same gap, same order. At lg
          it splits into two columns so a desk with real width isn't a phone strip with a
          void either side: the camera grows on the left, the outcome and search sit right
          where a mouse already is. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-5">
        {/* The camera box keeps its measurements: html5-qrcode sizes the video itself, and the
            crew are trained on this frame. Only its surface changed. */}
        <div className="relative min-h-[240px] overflow-hidden rounded-xl bg-foreground lg:min-h-[460px]">
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

        <div className="flex flex-col gap-3">
          {/*
            A fixed height, not a box that grows with its contents. This panel sits directly
            above the search field, and when it collapsed back to one line between scans the
            field jumped up under a thumb already reaching for it. Reserving the space costs a
            screenful of nothing on an idle scanner and buys a search box that never moves.
          */}
          <section
            role="status"
            aria-live="polite"
            className={cn(
              "flex min-h-44 flex-col justify-center rounded-xl p-4",
              busy ? "bg-muted text-foreground" : result ? TONE[result.status] : "border border-border bg-card text-muted-foreground"
            )}
          >
            {busy && (
              <div className="flex items-center gap-2.5">
                <Spinner className="size-4" />
                <span className="text-sm font-bold">Checking…</span>
              </div>
            )}
            {!busy && !result && <p className="text-sm">Point the camera at a badge, or search by name below.</p>}
            {result && <span className="sr-only">{count} of {total} checked in.</span>}
            {result && !busy && (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-bold uppercase tracking-[0.08em]">
                  {LABEL[result.status]}
                  {result.status === "duplicate" && result.earlier && <> · since {shortTime(result.earlier.at)}</>}
                </p>
                {named
                  ? <p className="text-2xl font-extrabold leading-tight text-balance">{result.attendee!.name}</p>
                  : <p className="text-lg font-bold leading-snug text-balance">{result.message}</p>}
                {named && result.fields && result.fields.some((f) => f.value) && (
                  <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    {result.fields.filter((f) => f.value).map((f) => (
                      <div key={f.label}>
                        <dt className="text-xs uppercase tracking-[0.08em] opacity-80">{f.label}</dt>
                        <dd className="font-bold">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {result.status === "ok" && undoLeft > 0 && (
                  <Button type="button" variant="outline" disabled={busy} className="mt-2 h-11 w-fit px-4 font-bold"
                    onClick={() => handle(() => undoCheckinAction(eventId, checkpoint.id, result.attendee!.id, crewToken))}>
                    <Undo2 data-icon="inline-start" />
                    Undo · {undoLeft}s
                  </Button>
                )}
              </div>
            )}
          </section>

          <div>
            <label htmlFor="scan-search" className="sr-only">Search attendees by name or email</label>
            <InputGroup className="h-12">
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
            <section className="mt-2 flex flex-col gap-1.5">
              <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Recent</h2>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-sm">
                {recent.map((r, i) => (
                  <li key={`${r.at}-${i}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="truncate font-semibold">{r.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{r.status === "undone" ? "undone" : r.status === "duplicate" ? "already in" : "in"} · {shortTime(r.at)}</span>
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
