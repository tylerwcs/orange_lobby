"use client";
import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, ImageUp, Plus, Trash2 } from "lucide-react";
import { draftFrom, keyFor, questionFormEntries, type QuestionDraft } from "@/lib/questions-form";
import { moveItem } from "@/lib/reorder";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { UploadImage } from "@/components/admin/RichTextEditor";
import { acceptImage, IMAGE_ACCEPT } from "@/lib/storage";
import { shrinkImage } from "@/lib/shrink-image";
import type { QuestionType, RegistrationQuestion } from "@/lib/types";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const TYPE_LABELS: Record<QuestionType, string> = { text: "Text", phone: "Phone", number: "Number", select: "Choice", textarea: "Long text", file: "File" };

type Card = QuestionDraft & { id: number };
const blank = (): QuestionDraft => ({ key: "", label: "", type: "text", required: false, options: [], description: "", showKey: "", showValue: "", min: "", max: "", decimals: "", sample: "" });

/**
 * The one question editor (D174, D243), for the registration form and for a submission
 * activity alike. Cards in on-screen order, one open at a time; keys never shown (D244);
 * a condition picks an earlier question by label (D245).
 *
 * Every field the server reads is a hidden input built by `questionFormEntries` from this
 * state, so the posted contract is the tested one (D247) and the visible controls carry no
 * names at all.
 *
 * `uploadImage` turns on a file question's sample picture (D395); registration has no file
 * questions, so only the submission editor passes it.
 */
export function QuestionCards({ questions, types, max, uploadImage }: {
  questions: RegistrationQuestion[];
  types: readonly QuestionType[];
  max: number;
  uploadImage?: UploadImage;
}) {
  const nextId = useRef(questions.length);
  const [cards, setCards] = useState<Card[]>(() => questions.map((q, i) => ({ ...draftFrom(q), id: i })));
  const [open, setOpen] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const update = (id: number, patch: Partial<QuestionDraft>) => setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= cards.length) return;
    const moved = cards[from];
    const next = moveItem(cards, from, to);
    setCards(next);
    setMessage(`${moved.label || "Question"} moved to position ${to + 1} of ${next.length}`);
  };
  const add = () => {
    const id = nextId.current++;
    setCards((cs) => [...cs, { ...blank(), type: types[0], id }]);
    setOpen(id);
  };

  return (
    <div className="flex flex-col gap-2">
      {questionFormEntries(cards).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}

      {cards.length === 0 && <p className="text-sm text-muted-foreground">No questions yet.</p>}
      <ol className="flex flex-col gap-2">
        {cards.map((c, i) => {
          const expanded = open === c.id;
          const earlier = cards.slice(0, i).filter((e) => e.label.trim());
          const target = earlier.find((e) => keyFor(e.key || e.label) === c.showKey);
          const summary = [TYPE_LABELS[c.type], c.required ? "required" : null, c.showKey ? "conditional" : null, c.type === "file" && c.sample ? "sample" : null].filter(Boolean).join(" · ");
          return (
            <li key={c.id} className={`rounded-lg border ${expanded ? "border-primary/50" : "border-border"}`}>
              <div className="flex items-center gap-1 px-2 py-1.5">
                <button type="button" aria-label={`Reorder ${c.label || `question ${i + 1}`}. Position ${i + 1} of ${cards.length}. Use the arrow keys to move it.`}
                  onKeyDown={(e) => { const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null; if (to === null) return; e.preventDefault(); move(i, to); }}
                  className="flex h-9 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-background">
                  <Icon name="grip" size={18} />
                </button>
                <button type="button" onClick={() => setOpen(expanded ? null : c.id)} aria-expanded={expanded}
                  className="flex min-w-0 flex-1 items-baseline gap-2 rounded-md px-1 py-1 text-left">
                  <span className="text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="truncate text-sm font-bold">{c.label || "Untitled question"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{summary}</span>
                </button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${c.label || "question"} up`} disabled={i === 0} onClick={() => move(i, i - 1)}><ChevronUp /></Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${c.label || "question"} down`} disabled={i === cards.length - 1} onClick={() => move(i, i + 1)}><ChevronDown /></Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${c.label || "question"}`} onClick={() => setCards((cs) => cs.filter((x) => x.id !== c.id))}><Trash2 /></Button>
              </div>

              {expanded && (
                <div className="grid gap-3 border-t border-border px-4 py-3">
                  <label className="grid gap-1.5 text-sm"><span className="font-bold">Question</span>
                    <input value={c.label} onChange={(e) => update(c.id, { label: e.target.value })} className={input} autoFocus /></label>
                  <div className="flex flex-wrap items-end gap-4">
                    <label className="grid gap-1.5 text-sm"><span className="font-bold">Type</span>
                      <select value={c.type} onChange={(e) => update(c.id, { type: e.target.value as QuestionType })} className={input}>
                        {types.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                      </select></label>
                    <label className="flex h-9 items-center gap-2 text-sm font-bold">
                      <input type="checkbox" checked={c.required} onChange={(e) => update(c.id, { required: e.target.checked })} className="size-4 accent-primary" />
                      Required
                    </label>
                  </div>
                  {c.type === "select" && (
                    <label className="grid gap-1.5 text-sm"><span className="font-bold">Choices</span>
                      <textarea rows={4} value={c.options.join("\n")} className={`${input} h-auto py-2`}
                        onChange={(e) => update(c.id, { options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
                      <span className="text-xs text-muted-foreground">One per line. A choice can’t contain a comma.</span></label>
                  )}
                  {c.type === "number" && (
                    <div className="flex flex-wrap gap-4">
                      {([["min", "Smallest allowed"], ["max", "Largest allowed"], ["decimals", "Decimal places"]] as const).map(([k, label]) => (
                        <label key={k} className="grid gap-1.5 text-sm"><span className="font-bold">{label}</span>
                          <input inputMode="decimal" value={c[k]} placeholder="Any" onChange={(e) => update(c.id, { [k]: e.target.value })}
                            className={`${input} w-28 tabular-nums`} /></label>
                      ))}
                    </div>
                  )}
                  {c.type === "file" && uploadImage && (
                    <SamplePicker url={c.sample} upload={uploadImage} onChange={(sample) => update(c.id, { sample })} />
                  )}
                  <label className="grid gap-1.5 text-sm"><span className="font-bold">Help text (optional)</span>
                    <input value={c.description} onChange={(e) => update(c.id, { description: e.target.value })} className={input} /></label>
                  <div className="grid gap-1.5 text-sm">
                    <span className="font-bold">Show only when</span>
                    <div className="flex flex-wrap gap-2">
                      <select aria-label="Depends on question" value={c.showKey} className={`${input} w-auto min-w-48 flex-1`}
                        onChange={(e) => update(c.id, { showKey: e.target.value, showValue: "" })}>
                        <option value="">Always show</option>
                        {earlier.map((e) => <option key={e.id} value={keyFor(e.key || e.label)}>{e.label}</option>)}
                        {/* A saved condition on a question that is not above this one (the old
                            table allowed it, and reordering can cause it) stays visible rather
                            than reading as "Always show" while still being saved. */}
                        {c.showKey && !target && (
                          <option value={c.showKey}>
                            {cards.find((e) => keyFor(e.key || e.label) === c.showKey)?.label ?? c.showKey} (below)
                          </option>
                        )}
                      </select>
                      {c.showKey && (target?.type === "select" ? (
                        <select aria-label="Answer" value={c.showValue} onChange={(e) => update(c.id, { showValue: e.target.value })} className={`${input} w-auto min-w-40 flex-1`}>
                          <option value="">Pick an answer</option>
                          {target.options.map((o) => <option key={o} value={o}>{o}</option>)}
                          {/* A condition is "the answer contains", so a saved one can be part of a
                              choice ("Twin" for "Twin Room – RM50 per person"). Offered as it is,
                              or the dropdown would show it blank and a Save would keep a value
                              nobody could see. */}
                          {c.showValue && !target.options.includes(c.showValue) && (
                            <option value={c.showValue}>contains “{c.showValue}”</option>
                          )}
                        </select>
                      ) : (
                        <input aria-label="Answer contains" placeholder="answer contains…" value={c.showValue} onChange={(e) => update(c.id, { showValue: e.target.value })} className={`${input} w-auto min-w-40 flex-1`} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="sr-only" role="status" aria-live="polite">{message}</p>
      {cards.length < max
        ? <Button type="button" variant="outline" size="sm" className="w-fit" onClick={add}><Plus data-icon="inline-start" />Add question</Button>
        : <p className="text-xs text-muted-foreground">That’s the most questions this form can have ({max}).</p>}
    </div>
  );
}

/**
 * A file question's sample picture (D395): what a good upload looks like, which attendees can
 * open from the form. The picture goes up the moment it is picked, the way an image in the
 * description editor does, and only its link rides the form, so Save keeps it or not along with
 * everything else on the card.
 */
function SamplePicker({ url, upload, onChange }: { url: string; upload: UploadImage; onChange: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(picked: File | undefined) {
    if (input.current) input.current.value = "";
    setError(null);
    if (!picked) return;
    setBusy(true);
    try {
      // A phone photo is often over the 4 MB the upload takes; the same shrink the portal uses.
      const file = await shrinkImage(picked);
      acceptImage(file);
      const fd = new FormData();
      fd.set("image", file);
      const res = await upload(fd).catch(() => ({ error: "Could not upload that image. Try again." }));
      if ("error" in res) setError(res.error);
      else onChange(res.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-1.5 text-sm">
      <span className="font-bold">Sample photo (optional)</span>
      <div className="flex flex-wrap items-center gap-2">
        {url && (
          <a href={url} target="_blank" rel="noreferrer" aria-label="Open the sample photo" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="size-14 rounded-md border border-border bg-muted object-contain" />
          </a>
        )}
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Spinner /> : <ImageUp aria-hidden />}
          {url ? "Replace sample" : "Add sample"}
        </Button>
        {url && !busy && (
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => onChange("")}>
            <Trash2 aria-hidden />Remove
          </Button>
        )}
        <input ref={input} type="file" accept={IMAGE_ACCEPT} className="sr-only" tabIndex={-1} aria-label="Sample photo" onChange={(e) => void choose(e.target.files?.[0])} />
      </div>
      {error
        ? <span className="text-xs text-destructive">{error}</span>
        : <span className="text-xs text-muted-foreground">An example of what to upload. People can open it from the form before they pick their own file.</span>}
    </div>
  );
}
