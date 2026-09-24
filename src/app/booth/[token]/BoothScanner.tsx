"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { CameraOff, Search, Undo2, X } from "lucide-react";
import { stampByTokenAction, stampByIdAction, searchForBoothAction, undoStampAction, type BoothScanResult, type BoothHit } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { describeCameraError, type CameraProblem } from "@/lib/scan";
import { meterAriaMax, meterAriaValue, meterPercent } from "@/lib/meter";
import { shortTime } from "@/lib/text";
import { cn } from "@/lib/utils";

type Recent = { name: string; at: string; status: BoothScanResult["status"] };
type CameraState = { phase: "starting" | "ready" | "error"; problem?: CameraProblem };

const UNDO_SECONDS = 6;

/** The ground each outcome is read off. Same pairs as the crew scanner's TONE map, which
 *  tests/contrast.test.ts already verifies at 4.5:1 for text and 3:1 for the undone ground. */
const TONE: Record<BoothScanResult["status"], string> = {
  ok: "bg-success-soft text-success-strong",
  duplicate: "bg-warning-soft text-warning",
  undone: "bg-foreground text-background",
  notfound: "bg-destructive-soft text-destructive-strong",
  // Styled like notfound: a stranger to this passport is still refused, not a different kind
  // of good news.
  ineligible: "bg-destructive-soft text-destructive-strong",
  // Neutral, not the destructive ground: nobody did anything wrong, stamping just is not open
  // yet. Same pair `busy` already uses above, so no new colour combination needs its own
  // contrast check.
  closed: "bg-muted text-foreground",
  error: "bg-destructive-soft text-destructive-strong",
};

const LABEL: Record<BoothScanResult["status"], string> = {
  ok: "Stamped",
  duplicate: "Already stamped",
  undone: "Stamp undone",
  notfound: "Not on the list",
  ineligible: "Not for this passport",
  closed: "Stamping closed",
  error: "Not saved",
};

// The same copy the server returns for an archived event (actions.ts's authoriseBooth),
// shown here immediately rather than waited for, since the camera never gets the chance to
// produce a scan that would otherwise surface it.
const ARCHIVED_MESSAGE = "This event is closed, so stamping has finished.";

// The same copy the server returns for a closed passport (actions.ts's stamp). Shown on load so
// the booth knows before the first badge; the camera still starts, because the organiser may
// open stamping at any moment and the next scan is decided by the server, not by this flag.
const CLOSED_MESSAGE = "This passport isn't open for stamping yet. Ask the organiser to open it.";

export function BoothScanner({
  boothToken,
  booth,
  archived,
  closed,
  initialCount,
  total,
}: {
  boothToken: string;
  booth: { name: string; location: string | null; passport: string };
  archived: boolean;
  closed: boolean;
  initialCount: number;
  total: number;
}) {
  // Neutral on load, not "error": nothing has been scanned yet, so there is nothing to have
  // failed. "closed" is also what a scan mid-session gets back from the server for a closed
  // passport (actions.ts's `stamp`), so the two never disagree about the same fact.
  const [result, setResult] = useState<BoothScanResult | null>(
    archived ? { status: "closed", message: ARCHIVED_MESSAGE } : closed ? { status: "closed", message: CLOSED_MESSAGE } : null,
  );
  const [count, setCount] = useState(initialCount);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [q, setQ] = useState(""); const [hits, setHits] = useState<BoothHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState<CameraState>({ phase: "starting" });
  const [undoLeft, setUndoLeft] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const busyRef = useRef(false);

  const handle = useCallback(async (fn: () => Promise<BoothScanResult>) => {
    busyRef.current = true;
    setBusy(true);
    // Drop the previous result before awaiting. On venue wifi a round trip can outlast the
    // gap between two people at a booth, and a stale "Stamped" left on screen reads as this
    // scan's result — the booth waves the next person through on the last person's outcome,
    // and nothing surfaces the mistake until the export is reconciled.
    setResult(null);
    setUndoLeft(0);
    try {
      const r = await fn();
      setResult(r);
      if (r.status === "ok") setCount((c) => c + 1);
      if (r.status === "undone") setCount((c) => Math.max(0, c - 1));
      if (r.name && r.status !== "error") setRecent((list) => [{ name: r.name!, at: new Date().toISOString(), status: r.status }, ...list].slice(0, 4));
      setUndoLeft(r.status === "ok" ? UNDO_SECONDS : 0);
      if (navigator.vibrate) navigator.vibrate(r.status === "ok" ? 100 : [80, 60, 80]);
    } catch {
      setResult({ status: "error", message: "The stamp didn't reach the server. Check the connection and scan again." });
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
        await handle(() => stampByTokenAction(boothToken, text));
      }, () => {})
        .then(() => { if (!cancelled) setCamera({ phase: "ready" }); })
        .catch((e) => { if (!cancelled) setCamera({ phase: "error", problem: describeCameraError(e) }); });
    });
    return () => { cancelled = true; };
  }, [boothToken, handle]);

  useEffect(() => {
    // An archived event never prompts for the camera at all: stamping is already over, so
    // there is nothing for it to accomplish and no reason to ask a stranger's phone for one.
    if (archived) return;
    const cancel = startCamera();
    return () => { cancel(); scannerRef.current?.stop().catch(() => {}); };
  }, [startCamera, archived]);

  useEffect(() => {
    if (undoLeft <= 0) return;
    const t = setTimeout(() => setUndoLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [undoLeft]);

  useEffect(() => {
    const t = setTimeout(async () => { setHits(q.trim().length >= 2 ? await searchForBoothAction(boothToken, q) : []); }, 250);
    return () => clearTimeout(t);
  }, [q, boothToken]);

  const named = result?.name && result.status !== "error" && result.status !== "notfound" && result.status !== "ineligible";

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-3">
      <header className="flex flex-col gap-1.5">
        {/* No checkpoint chooser here: a booth link goes to exactly one booth, and there is
            nowhere else on this page to send anyone. */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Booth scanner</p>
            <p className="truncate text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{booth.passport}</p>
            <p className="truncate text-base font-extrabold leading-tight">{booth.name}</p>
            {booth.location && <p className="truncate text-xs font-semibold text-muted-foreground">{booth.location}</p>}
          </div>
          <p className="flex shrink-0 items-baseline gap-1.5">
            <span className="text-2xl font-extrabold leading-none tabular-nums">{count}</span>
            <span className="text-xs font-semibold text-muted-foreground">of {total} stamped</span>
          </p>
        </div>
        {/* Brand orange, not the crew scanner's check-in green (D100): a stamp is not
            attendance, and the different colour is what stops a crew member mistaking one
            scanner for the other. */}
        <Progress
          value={Math.round(meterPercent(count, total))}
          className="[&_[data-slot=progress-indicator]]:bg-brand"
          aria-label={`${count} of ${total} stamped at ${booth.name}`}
          aria-valuenow={meterAriaValue(count, total)}
          aria-valuemin={0}
          aria-valuemax={meterAriaMax(total)}
        />
      </header>

      {/* The camera box keeps its measurements from the crew scanner: html5-qrcode sizes the
          video itself. When the event is archived the camera is never started, so this stays
          an inert black frame — no "Starting camera…" text that could never come true. */}
      <div className="relative min-h-[240px] overflow-hidden rounded-xl bg-foreground">
        <div id="reader" />
        {!archived && camera.phase === "starting" && (
          <p className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-background/70">Starting camera…</p>
        )}
        {!archived && camera.phase === "error" && camera.problem && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-background">
            <CameraOff className="size-7 text-background/70" />
            <p className="text-lg font-extrabold">{camera.problem.title}</p>
            <p className="text-sm text-background/70">{camera.problem.hint}</p>
            <Button type="button" variant="secondary" className="mt-2 h-11 px-4" onClick={() => { setCamera({ phase: "starting" }); startCamera(); }}>Retry camera</Button>
          </div>
        )}
      </div>

      {/*
        A fixed height, not a box that grows with its contents — same reasoning as the crew
        scanner: this panel sits directly above the search field, and the field must never
        jump under a thumb already reaching for it.
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
        {result && <span className="sr-only">{count} of {total} stamped.</span>}
        {result && !busy && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-bold uppercase tracking-[0.08em]">
              {LABEL[result.status]}
              {result.status === "duplicate" && result.earlier && <> · since {shortTime(result.earlier.at)}</>}
            </p>
            {/* Name and progress only — no field list (D98). A booth never learns a
                company, a table, a phone or an email, here or anywhere else in this file. */}
            {named
              ? <p className="text-2xl font-extrabold leading-tight text-balance">{result.name}</p>
              : <p className="text-lg font-bold leading-snug text-balance">{result.message}</p>}
            {named && result.progress && <p className="text-sm font-bold">{result.progress}</p>}
            {result.status === "ok" && undoLeft > 0 && (
              <Button type="button" variant="outline" disabled={busy} className="mt-2 h-11 w-fit px-4 font-bold"
                onClick={() => handle(() => undoStampAction(boothToken, result.attendeeId!))}>
                <Undo2 data-icon="inline-start" />
                Undo · {undoLeft}s
              </Button>
            )}
          </div>
        )}
      </section>

      <div>
        <label htmlFor="booth-search" className="sr-only">Search attendees by name</label>
        <InputGroup className="h-12">
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput
            id="booth-search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search"
            placeholder="Search by name" className="h-12 text-base"
          />
          {/* Badges do not always scan, and the next person is waiting: clearing a search has
              to be one tap rather than a held backspace. */}
          {q.length > 0 && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-sm" aria-label="Clear search" onClick={() => setQ("")}><X /></InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      </div>

      {hits.length > 0 && (
        // No per-row action badge here: there is no "already in" to report, and no company
        // or table to show — just enough to tell two Sarahs apart (D99).
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" disabled={busy} onClick={() => handle(() => stampByIdAction(boothToken, h.id))}
                className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-60">
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{h.name}</span>
                {h.category && <Badge variant="secondary" className="shrink-0">{h.category}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {q.trim().length >= 2 && hits.length === 0 && !busy && (
        <Empty className="border border-dashed py-6">
          <EmptyHeader>
            <EmptyTitle>No one matches &ldquo;{q.trim()}&rdquo;</EmptyTitle>
            <EmptyDescription>Try a shorter name, or part of it.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {recent.length > 0 && (
        <section className="mt-2 flex flex-col gap-1.5">
          <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Just now</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-sm">
            {recent.map((r, i) => (
              <li key={`${r.at}-${i}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="truncate font-semibold">{r.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{r.status === "undone" ? "undone" : r.status === "duplicate" ? "already stamped" : "stamped"} · {shortTime(r.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
        Keep this page open at the booth. It stamps this booth only.
      </p>
    </main>
  );
}
