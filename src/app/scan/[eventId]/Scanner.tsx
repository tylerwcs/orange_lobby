"use client";
import { useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { checkInByTokenAction, checkInByIdAction, searchAttendeesAction, walkInAction, type ScanResult } from "./actions";
import type { Checkpoint } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";
import { Pill, Button } from "@/components/ui/Card";

type Hit = { id: string; name: string; company: string | null; table_no: string | null };

export function Scanner({ eventId, checkpoint, initialCount, total }: { eventId: string; checkpoint: Checkpoint; initialCount: number; total: number }) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [count, setCount] = useState(initialCount);
  const [q, setQ] = useState(""); const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false); const [showWalkIn, setShowWalkIn] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // Dynamic import: Html5Qrcode touches `window`/`navigator` at module load, which
    // breaks `npm run build`'s prerender pass even though this component is "use client".
    // Loading it only inside this browser-only effect keeps the build clean.
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (cancelled) return;
      const s = new Html5Qrcode("reader");
      scannerRef.current = s;
      s.start({ facingMode: "environment" }, { fps: 8, qrbox: 220 }, async (text) => {
        if (busyRef.current) return;
        const now = Date.now();
        if (text === lastRef.current.text && now - lastRef.current.at < 3000) return;
        lastRef.current = { text, at: now };
        await handle(() => checkInByTokenAction(eventId, checkpoint.id, text));
      }, () => {}).catch((e) => setResult({ status: "error", message: `Camera error: ${String(e)}` }));
    });
    return () => { cancelled = true; scannerRef.current?.stop().catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handle(fn: () => Promise<ScanResult>) {
    busyRef.current = true;
    setBusy(true);
    try { const r = await fn(); setResult(r); if (r.status === "ok") setCount((c) => c + 1); if (navigator.vibrate) navigator.vibrate(r.status === "ok" ? 100 : [80, 60, 80]); }
    catch (e) { setResult({ status: "error", message: String(e) }); }
    finally { busyRef.current = false; setBusy(false); setHits([]); setQ(""); setShowWalkIn(false); }
  }

  useEffect(() => {
    const t = setTimeout(async () => { setHits(q.trim().length >= 2 ? await searchAttendeesAction(eventId, q) : []); }, 250);
    return () => clearTimeout(t);
  }, [q, eventId]);

  const tone = result?.status === "ok" ? "bg-green-600 text-white" : result?.status === "duplicate" ? "bg-amber-500 text-ink" : result ? "bg-red-600 text-white" : "border border-line bg-surface text-muted";
  return (
    <main className="mx-auto max-w-md p-3">
      <div className="mb-2 flex items-center justify-between">
        <a href={`/scan/${eventId}`} className="flex min-h-11 items-center gap-1 text-sm font-bold text-ink">
          <Icon name="chevron" size={18} className="rotate-180" />
          {checkpoint.name}
        </a>
        <Pill>{count}/{total}</Pill>
      </div>
      <div id="reader" className="overflow-hidden rounded-[var(--radius-card)] bg-ink" />
      <div className={`mt-3 rounded-[var(--radius-card)] p-4 ${tone}`}>
        {!result && <p className="text-sm">Point the camera at a badge QR, or search by name below.</p>}
        {result && (result.status === "ok" || result.status === "duplicate") && result.attendee && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] opacity-90">{result.status === "ok" ? "Checked in" : `Already checked in at ${new Date(result.earlier!.at).toLocaleTimeString("en-MY")}`}</div>
            <div className="text-2xl font-extrabold leading-tight">{result.attendee.name}</div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">{result.fields?.filter((f) => f.value).map((f) => <div key={f.label}><dt className="text-[11px] uppercase tracking-[0.08em] opacity-80">{f.label}</dt><dd className="font-bold">{f.value}</dd></div>)}</dl>
          </div>
        )}
        {result && (result.status === "notfound" || result.status === "error") && <div className="font-bold">{result.message}</div>}
      </div>
      <div className="mt-3 relative">
        <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / email / company" className="mt-0 w-full min-h-12 rounded-[var(--radius-control)] border border-line bg-surface pl-11 pr-3.5 text-base" />
      </div>
      {hits.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {hits.map((h) => <li key={h.id}><button disabled={busy} onClick={() => handle(() => checkInByIdAction(eventId, checkpoint.id, h.id))} className="w-full min-h-14 rounded-[var(--radius-card)] border border-line bg-surface px-4 text-left"><div className="font-bold">{h.name}</div><div className="text-xs text-muted">{h.company}{h.table_no ? ` · Table ${h.table_no}` : ""}</div></button></li>)}
        </ul>
      )}
      <Button type="button" variant="secondary" icon="user" className="mt-4 w-full" onClick={() => setShowWalkIn((v) => !v)}>Add walk-in</Button>
      {showWalkIn && (
        <form action={(fd) => handle(() => walkInAction(eventId, checkpoint.id, fd))} className="mt-2 flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-3">
          <input name="name" placeholder="Full name *" required className="w-full min-h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-base" /><input name="email" placeholder="Email" className="w-full min-h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-base" />
          <input name="phone" placeholder="Phone" className="w-full min-h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-base" /><input name="company" placeholder="Company" className="w-full min-h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-base" />
          <Button type="submit" disabled={busy} className="w-full">Add and check in</Button>
        </form>
      )}
    </main>
  );
}
