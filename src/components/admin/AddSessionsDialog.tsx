"use client";
import { useState } from "react";
import { generateSlots } from "@/lib/session-slots";
import { Modal } from "@/components/admin/Modal";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Button } from "@/components/ui/button";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const label = "text-sm font-bold";

/**
 * The only way sessions are added (D241): days × a time range, stepped, minus breaks. The count
 * under the form comes from the same `generateSlots` the server runs, so "Makes 32 sessions" is
 * what lands, and the server still re-checks everything it is sent.
 */
export function AddSessionsDialog({ addSessions, existing, defaultDay }: {
  addSessions: (fd: FormData) => Promise<void>;
  existing: { day: string; starts_at: string }[];
  defaultDay: string | null;
}) {
  const [days, setDays] = useState<string[]>([defaultDay ?? ""]);
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("10:00");
  const [every, setEvery] = useState("30");
  const [breaks, setBreaks] = useState<{ from: string; to: string }[]>([]);
  const [capacity, setCapacity] = useState("20");
  const [location, setLocation] = useState("");

  const plan = generateSlots({
    days, from, to, every: Number.parseInt(every, 10), breaks,
    capacity: Number.parseInt(capacity, 10), location: location.trim() || null,
  }, existing);
  const summary = plan.ok
    ? `Makes ${plan.slots.length} session${plan.slots.length === 1 ? "" : "s"}${plan.skipped ? ` (${plan.skipped} already exist)` : ""}`
    : plan.error;

  return (
    <Modal title="Add sessions" hint="Pick the days and a time range; it makes one session per step." trigger="Add sessions" icon="plus">
      <form action={addSessions} className="grid gap-4">
        <fieldset className="grid gap-2">
          <legend className={`${label} mb-1.5`}>Days</legend>
          {days.map((d, i) => (
            <div key={i} className="flex gap-2">
              <input name="day" type="date" value={d} aria-label={`Day ${i + 1}`} className={input}
                onChange={(e) => setDays(days.map((x, j) => (j === i ? e.target.value : x)))} />
              {days.length > 1 && (
                <Button type="button" variant="ghost" onClick={() => setDays(days.filter((_, j) => j !== i))} aria-label={`Remove day ${i + 1}`}>Remove</Button>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setDays([...days, ""])}>Add day</Button>
        </fieldset>

        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-1.5"><span className={label}>From</span>
            <input name="from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={input} /></label>
          <label className="grid gap-1.5"><span className={label}>To</span>
            <input name="to" type="time" value={to} onChange={(e) => setTo(e.target.value)} className={input} /></label>
        </div>

        <label className="grid gap-1.5"><span className={label}>Each session lasts (minutes)</span>
          <input name="every" type="number" min={5} max={240} inputMode="numeric" value={every} onChange={(e) => setEvery(e.target.value)} className={`${input} max-w-32 tabular-nums`} /></label>

        <fieldset className="grid gap-2">
          <legend className={`${label} mb-1.5`}>Breaks to skip (optional)</legend>
          {breaks.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <input name="break_from" type="time" value={b.from} aria-label={`Break ${i + 1} from`} className={input}
                onChange={(e) => setBreaks(breaks.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} />
              <span className="text-sm text-muted-foreground">to</span>
              <input name="break_to" type="time" value={b.to} aria-label={`Break ${i + 1} to`} className={input}
                onChange={(e) => setBreaks(breaks.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} />
              <Button type="button" variant="ghost" onClick={() => setBreaks(breaks.filter((_, j) => j !== i))} aria-label={`Remove break ${i + 1}`}>Remove</Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setBreaks([...breaks, { from: "", to: "" }])}>Add break</Button>
        </fieldset>

        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-1.5"><span className={label}>Seats per session</span>
            <input name="capacity" type="number" min={1} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} className={`${input} max-w-32 tabular-nums`} /></label>
          <label className="grid gap-1.5"><span className={label}>Location (optional)</span>
            <input name="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room 2A" className={input} /></label>
        </div>

        <p role="status" className={`text-sm ${plan.ok ? "text-muted-foreground" : "text-destructive"}`}>{summary}</p>
        <SubmitButton>{plan.ok ? `Add ${plan.slots.length} session${plan.slots.length === 1 ? "" : "s"}` : "Add sessions"}</SubmitButton>
      </form>
    </Modal>
  );
}
