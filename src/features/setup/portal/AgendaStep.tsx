"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { suggestedDayDate } from "@/lib/agenda";
import { eventDays, nowInKL } from "@/lib/time";
import { formatDateRange } from "@/lib/text";
import { problemSentence } from "../sections";
import {
  agendaErrors, agendaProblems, blankSession, dayName, errorKey,
  type AgendaAnswers, type DateRange, type SessionField, type SetupDay, type SetupSession,
} from "../sections/agenda";
import type { HubFile } from "../hub";
import type { SectionStatus } from "../status";
import { AgendaPreview, type AgendaSlot } from "../preview/AgendaPreview";
import { SetupItemPanel } from "./SetupItemPanel";
import { StepFrame, StepGroup } from "./StepFrame";
import { useSectionAutosave } from "./useSectionAutosave";

const focusField = (slot: string) =>
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-setup-field="${slot}"]`)?.focus());

/**
 * The agenda (D446, D453): upload the one they already have, or type it in - one card per day,
 * its sessions under it, each with time and title up front and the rest behind More. The preview
 * shows the day being edited, the session being edited outlined (D445).
 */
export function AgendaStep({ token, initial, initialRev, initialStatus, initialUnsubmitted, range, primaryColor, files, notes }: {
  token: string;
  initial: AgendaAnswers;
  initialRev: number;
  initialStatus: SectionStatus;
  initialUnsubmitted: boolean;
  range: DateRange;
  primaryColor: string;
  files: HubFile[];
  notes: string;
}) {
  const step = useSectionAutosave({ token, section: "agenda", initial, initialRev, initialStatus, initialUnsubmitted, seed: initial });
  const { answers: a, setAnswers: set } = step;
  const [focused, setFocused] = useState<AgendaSlot | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const errors = agendaErrors(a, range);
  const problems = agendaProblems(a, range);
  const err = (id: string, field: string) => errors[errorKey(id, field)];

  const addDay = () => {
    const id = crypto.randomUUID();
    const date = suggestedDayDate(eventDays(range.first, range.last), a.days.map((d) => d.date), nowInKL().date);
    set((p) => ({ ...p, days: [...p.days, { id, date, name: "" }] }));
    setFocused(`day:${id}`);
    focusField(`day:${id}`);
  };
  const editDay = (id: string, patch: Partial<SetupDay>) => set((p) => ({ ...p, days: p.days.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  const removeDay = (d: SetupDay, n: number) => {
    const count = a.sessions.filter((s) => s.day === d.id).length;
    if (count > 0 && !window.confirm(`Remove ${dayName(d, n)} and its ${count} session${count === 1 ? "" : "s"}?`)) return;
    set((p) => ({ days: p.days.filter((x) => x.id !== d.id), sessions: p.sessions.filter((s) => s.day !== d.id) }));
  };
  const addSession = (day: string) => {
    const s = blankSession(crypto.randomUUID(), day);
    set((p) => ({ ...p, sessions: [...p.sessions, s] }));
    setFocused(`session:${s.id}`);
    focusField(`session:${s.id}`);
  };
  const editSession = (id: string, patch: Partial<SetupSession>) => set((p) => ({ ...p, sessions: p.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const removeSession = (id: string) => set((p) => ({ ...p, sessions: p.sessions.filter((s) => s.id !== id) }));
  const jump = (slot: AgendaSlot) => {
    setFocused(slot);
    focusField(slot);
  };

  return (
    <StepFrame token={token} title="Agenda" step={step} complete={problems.length === 0} incompleteHint={problemSentence(problems) ?? undefined}
      preview={<AgendaPreview agenda={a} primaryColor={primaryColor} focused={focused} onSlot={jump} />}>
      <StepGroup title="Already have your agenda?" help="Upload it in Excel, Word or PDF and we'll set it up for you. Then you don't need to fill in the days below.">
        <SetupItemPanel token={token} itemKey="agenda" initialFiles={files} initialNotes={notes} notesPlaceholder="Anything we should know about the agenda" />
      </StepGroup>

      <p className="text-sm text-muted-foreground">
        Or type it in: one tab per day in the portal{range.first ? `, within your event dates (${formatDateRange(range.first, range.last)})` : ""}.
        Times are Malaysia time. Attendees see each day in time order. Breakout rounds, photos and who each session is for: send them as files and we&apos;ll add them.
      </p>

      {a.days.map((d, n) => (
        <section key={d.id} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5" onFocus={() => setFocused(`day:${d.id}`)}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Date</span>
              <Input type="date" value={d.date} data-setup-field={`day:${d.id}`} className="w-44"
                aria-invalid={err(d.id, "date") ? true : undefined} onChange={(e) => editDay(d.id, { date: e.target.value })} />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-sm font-bold">Name <span className="font-normal text-muted-foreground">(optional)</span></span>
              <Input value={d.name} placeholder={`Day ${n + 1}`} onChange={(e) => editDay(d.id, { name: e.target.value })} />
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={() => removeDay(d, n)}>Remove day</Button>
          </div>
          {err(d.id, "date") && <span className="text-xs font-semibold text-destructive">{err(d.id, "date")}</span>}
          <ul className="flex flex-col gap-3">
            {a.sessions.filter((s) => s.day === d.id).map((s) => (
              <SessionRow key={s.id} s={s} error={(f) => err(s.id, f)}
                expanded={open === s.id} onExpand={() => setOpen(open === s.id ? null : s.id)}
                onEdit={(patch) => editSession(s.id, patch)} onRemove={() => removeSession(s.id)}
                onFocus={() => setFocused(`session:${s.id}`)} />
            ))}
          </ul>
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => addSession(d.id)}>Add session</Button>
        </section>
      ))}

      <Button type="button" variant="outline" className="self-start" onClick={addDay}>Add day</Button>
    </StepFrame>
  );
}

/** One session: time and title up front; location and description behind More. */
function SessionRow({ s, error, expanded, onExpand, onEdit, onRemove, onFocus }: {
  s: SetupSession;
  error: (field: SessionField) => string | undefined;
  expanded: boolean;
  onExpand: () => void;
  onEdit: (patch: Partial<SetupSession>) => void;
  onRemove: () => void;
  onFocus: () => void;
}) {
  const bind = (f: SessionField) => ({
    value: s[f],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onEdit({ [f]: e.target.value }),
    "aria-invalid": error(f) ? true : undefined,
  });
  const label = "flex flex-col gap-1.5 text-sm font-bold";

  return (
    // stopPropagation: the day's card also listens for focus, and the innermost spot wins.
    <li className="flex flex-col gap-3 rounded-lg border border-border p-3" onFocus={(e) => { e.stopPropagation(); onFocus(); }}>
      {/* On a phone the title takes its own line under the times, with More and Remove beside the times; from sm up all five share one line. */}
      <div className="flex flex-wrap items-start gap-2">
        <Input type="time" aria-label="Starts" className="w-28" {...bind("starts_at")} />
        <Input type="time" aria-label="Ends (optional)" className="w-28" {...bind("ends_at")} />
        <Input aria-label="Title" placeholder="Session title" className="order-last min-w-0 basis-full sm:order-none sm:basis-0 sm:flex-1" data-setup-field={`session:${s.id}`} {...bind("title")} />
        <Button type="button" variant="ghost" size="sm" className="ml-auto sm:ml-0" aria-expanded={expanded} onClick={onExpand}>{expanded ? "Less" : "More"}</Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Remove session" onClick={onRemove}><Trash2 /></Button>
      </div>
      {(["starts_at", "ends_at"] as const).map((f) => error(f) && <span key={f} className="text-xs font-semibold text-destructive">{error(f)}</span>)}
      {expanded && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Location<Input placeholder="Grand Ballroom" {...bind("location")} /></label>
          <label className={`${label} sm:col-span-2`}>Description<Textarea rows={2} {...bind("description")} /></label>
        </div>
      )}
    </li>
  );
}
