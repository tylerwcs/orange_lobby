"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { checkInByTokenAction, checkInByIdAction, searchAttendeesAction, walkInAction, undoCheckinAction, type ScanResult, type SearchHit } from "./actions";
import type { Checkpoint } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Card";
import { describeCameraError, type CameraProblem } from "@/lib/scan";
import { shortTime } from "@/lib/text";

type Recent = { name: string; at: string; status: ScanResult["status"] };
type CameraState = { phase: "starting" | "ready" | "error"; problem?: CameraProblem };

const UNDO_SECONDS = 6;
const control = "w-full min-h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-base";

export function Scanner({ eventId, checkpoint, initialCount, total }: { eventId: string; checkpoint: Checkpoint; initialCount: number; total: number }) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [count, setCount] = useState(initialCount);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [q, setQ] = useState(""); const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false); const [showWalkIn, setShowWalkIn] = useState(false);
  const [camera, setCamera] = useState<CameraState>({ phase: "starting" });
  const [undoLeft, setUndoLeft] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const busyRef = useRef(false);
  const walkInRef = useRef<HTMLFormElement | null>(null);

  const handle = useCallback(async (fn: () => Promise<ScanResult>) => {
    busyRef.current = true;
    setBusy(true);
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
    } finally { busyRef.current = false; setBusy(false); setHits([]); setQ(""); setShowWalkIn(false); }
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
        await handle(() => checkInByTokenAction(eventId, checkpoint.id, text));
      }, () => {})
        .then(() => { if (!cancelled) setCamera({ phase: "ready" }); })
        .catch((e) => { if (!cancelled) setCamera({ phase: "error", problem: describeCameraError(e) }); });
    });
    return () => { cancelled = true; };
  }, [eventId, checkpoint.id, handle]);

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
    const t = setTimeout(async () => { setHits(q.trim().length >= 2 ? await searchAttendeesAction(eventId, q, checkpoint.id) : []); }, 250);
    return () => clearTimeout(t);
  }, [q, eventId, checkpoint.id]);

  useEffect(() => {
    if (showWalkIn) {
      walkInRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      walkInRef.current?.querySelector<HTMLInputElement>("input[name=name]")?.focus();
    }
  }, [showWalkIn]);

  const tone = result?.status === "ok" ? "bg-ok-soft text-ok-strong"
    : result?.status === "duplicate" ? "bg-warn-soft text-warn"
    : result?.status === "undone" ? "bg-ink text-white"
    : result ? "bg-danger-soft text-danger-strong"
    : "border border-line bg-surface text-muted";
  const headline = result?.status === "ok" ? "Checked in"
    : result?.status === "duplicate" ? `Already in since ${shortTime(result.earlier!.at)}`
    : result?.status === "undone" ? "Check-in undone" : "";

  return (
    <main className="mx-auto max-w-md p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <a href={`/scan/${eventId}`} className="flex min-h-11 items-center gap-1 text-sm font-bold text-ink">
          <Icon name="chevron" size={18} className="rotate-180" />
          {checkpoint.name}
        </a>
        <div className="flex items-baseline gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-white" aria-label={`${count} of ${total} checked in`}>
          <span className="text-xl font-extrabold leading-none">{count}</span>
          <span className="text-xs font-semibold text-gray-300">of {total} in</span>
        </div>
      </div>

      <div className="relative min-h-[240px] overflow-hidden rounded-[var(--radius-card)] bg-ink">
        <div id="reader" />
        {camera.phase === "starting" && (
          <p className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-gray-300">Starting camera…</p>
        )}
        {camera.phase === "error" && camera.problem && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            <Icon name="scan" size={28} className="text-brand" />
            <div className="text-lg font-extrabold">{camera.problem.title}</div>
            <p className="text-sm text-gray-300">{camera.problem.hint}</p>
            <Button type="button" variant="primary" onClick={() => { setCamera({ phase: "starting" }); startCamera(); }}>Retry camera</Button>
          </div>
        )}
      </div>

      <div className={`mt-3 rounded-[var(--radius-card)] p-4 ${tone}`} role="status" aria-live="polite">
        {!result && <p className="text-sm">Point the camera at a badge, or search by name below.</p>}
        {result && <span className="sr-only">{count} of {total} checked in.</span>}
        {result && result.attendee && result.status !== "error" && result.status !== "notfound" && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em]">{headline}</div>
            <div className="text-[20px] font-extrabold leading-tight">{result.attendee.name}</div>
            {result.fields && (
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                {result.fields.filter((f) => f.value).map((f) => <div key={f.label}><dt className="text-[11px] uppercase tracking-[0.08em]">{f.label}</dt><dd className="font-bold">{f.value}</dd></div>)}
              </dl>
            )}
            {result.status === "ok" && undoLeft > 0 && (
              <button type="button" disabled={busy} onClick={() => handle(() => undoCheckinAction(eventId, checkpoint.id, result.attendee!.id))}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-ok-strong px-4 text-sm font-bold text-white">
                Undo · {undoLeft}s
              </button>
            )}
          </div>
        )}
        {result && (result.status === "notfound" || result.status === "error") && <div className="font-bold">{result.message}</div>}
      </div>

      <div className="relative mt-3">
        <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <label htmlFor="scan-search" className="sr-only">Search attendees by name, email or company</label>
        <input id="scan-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or company" autoComplete="off" className="w-full min-h-12 rounded-[var(--radius-control)] border border-line bg-surface pl-11 pr-3.5 text-base" />
      </div>
      {hits.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {hits.map((h) => (
            <li key={h.id}>
              <button disabled={busy} onClick={() => handle(() => checkInByIdAction(eventId, checkpoint.id, h.id))}
                className="flex w-full min-h-14 items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 text-left active:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{h.name}</div>
                  <div className="truncate text-xs text-muted">{[h.company, h.category, h.table_no ? `Table ${h.table_no}` : null].filter(Boolean).join(" · ")}</div>
                </div>
                {h.checkedIn
                  ? <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">Already in</span>
                  : <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-ink">Check in</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && hits.length === 0 && !busy && (
        <p className="mt-2 text-sm text-muted">No one matches &ldquo;{q.trim()}&rdquo;. Try a shorter name, or add them as a walk-in.</p>
      )}

      <Button type="button" variant="secondary" icon="user" className="mt-4 w-full" onClick={() => setShowWalkIn((v) => !v)} aria-expanded={showWalkIn}>
        {showWalkIn ? "Cancel walk-in" : "Add walk-in"}
      </Button>
      {showWalkIn && (
        <form ref={walkInRef} action={(fd) => handle(() => walkInAction(eventId, checkpoint.id, fd))} className="mt-2 flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-3">
          <label className="text-sm font-bold" htmlFor="walkin-name">Full name</label>
          <input id="walkin-name" name="name" required className={control} />
          <label className="text-sm font-bold" htmlFor="walkin-email">Email <span className="font-normal text-muted">(matches the masterlist if they are on it)</span></label>
          <input id="walkin-email" name="email" type="email" inputMode="email" className={control} />
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-sm font-bold" htmlFor="walkin-phone">Phone</label><input id="walkin-phone" name="phone" type="tel" className={control} /></div>
            <div><label className="text-sm font-bold" htmlFor="walkin-company">Company</label><input id="walkin-company" name="company" className={control} /></div>
          </div>
          <Button type="submit" disabled={busy} className="w-full">Add and check in</Button>
        </form>
      )}

      {recent.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-muted">Recent</h2>
          <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface text-sm">
            {recent.map((r, i) => (
              <li key={`${r.at}-${i}`} className="flex items-center justify-between px-3.5 py-2.5">
                <span className="truncate font-semibold">{r.name}</span>
                <span className="ml-3 shrink-0 text-xs text-muted">{r.status === "undone" ? "undone" : r.status === "duplicate" ? "already in" : "in"} · {shortTime(r.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
