"use client";
import { useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { checkInByTokenAction, checkInByIdAction, searchAttendeesAction, walkInAction, type ScanResult } from "./actions";
import type { Checkpoint } from "@/lib/types";

type Hit = { id: string; name: string; company: string | null; table_no: string | null };

export function Scanner({ eventId, checkpoint, initialCount, total }: { eventId: string; checkpoint: Checkpoint; initialCount: number; total: number }) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [count, setCount] = useState(initialCount);
  const [q, setQ] = useState(""); const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false); const [showWalkIn, setShowWalkIn] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });

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
    setBusy(true);
    try { const r = await fn(); setResult(r); if (r.status === "ok") setCount((c) => c + 1); if (navigator.vibrate) navigator.vibrate(r.status === "ok" ? 100 : [80, 60, 80]); }
    catch (e) { setResult({ status: "error", message: String(e) }); }
    finally { setBusy(false); setHits([]); setQ(""); setShowWalkIn(false); }
  }

  useEffect(() => {
    const t = setTimeout(async () => { setHits(q.trim().length >= 2 ? await searchAttendeesAction(eventId, q) : []); }, 250);
    return () => clearTimeout(t);
  }, [q, eventId]);

  const tone = result?.status === "ok" ? "bg-green-600" : result?.status === "duplicate" ? "bg-amber-500" : result ? "bg-red-600" : "bg-gray-200";
  return (
    <main className="mx-auto max-w-md p-3">
      <div className="mb-2 flex items-center justify-between text-sm"><a href={`/scan/${eventId}`} className="underline">← {checkpoint.name}</a><span>{count}/{total} checked in</span></div>
      <div id="reader" className="overflow-hidden rounded-lg" />
      <div className={`mt-3 rounded-lg p-4 text-white ${tone}`}>
        {!result && <p className="text-gray-700">Point the camera at a badge QR, or search by name below.</p>}
        {result && (result.status === "ok" || result.status === "duplicate") && result.attendee && (
          <div>
            <div className="text-xs uppercase opacity-90">{result.status === "ok" ? "Checked in" : `Already checked in at ${new Date(result.earlier!.at).toLocaleTimeString("en-MY")}`}</div>
            <div className="text-2xl font-bold">{result.attendee.name}</div>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 text-sm">{result.fields?.filter((f) => f.value).map((f) => <div key={f.label}><dt className="opacity-80">{f.label}</dt><dd className="font-medium">{f.value}</dd></div>)}</dl>
          </div>
        )}
        {result && (result.status === "notfound" || result.status === "error") && <div className="font-medium">{result.message}</div>}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / email / company" className="mt-3 w-full rounded-lg border p-3 text-base" />
      {hits.length > 0 && (
        <ul className="mt-2 divide-y rounded-lg border bg-white">
          {hits.map((h) => <li key={h.id}><button disabled={busy} onClick={() => handle(() => checkInByIdAction(eventId, checkpoint.id, h.id))} className="w-full p-3 text-left"><div className="font-medium">{h.name}</div><div className="text-xs text-gray-500">{h.company}{h.table_no ? ` · Table ${h.table_no}` : ""}</div></button></li>)}
        </ul>
      )}
      <button onClick={() => setShowWalkIn((v) => !v)} className="mt-4 text-sm underline">Add walk-in</button>
      {showWalkIn && (
        <form action={(fd) => handle(() => walkInAction(eventId, checkpoint.id, fd))} className="mt-2 space-y-2 rounded-lg border bg-white p-3">
          <input name="name" placeholder="Full name *" required className="w-full rounded border p-2" /><input name="email" placeholder="Email" className="w-full rounded border p-2" />
          <input name="phone" placeholder="Phone" className="w-full rounded border p-2" /><input name="company" placeholder="Company" className="w-full rounded border p-2" />
          <button disabled={busy} className="w-full rounded bg-orange-600 p-2 text-white">Add and check in</button>
        </form>
      )}
    </main>
  );
}
