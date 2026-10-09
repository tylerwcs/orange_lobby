"use client";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { packQuestions, type QuestionDraft } from "../config-form";
import { OPTION_STYLES } from "../views";
import { moveItem } from "@/lib/reorder";
import type { Question } from "../config";

type Item = QuestionDraft & { id: number };

const toDraft = (q: Question): QuestionDraft => ({ text: q.text, options: [0, 1, 2, 3].map((i) => q.options[i] ?? ""), correct: q.correct });
const blank = (): QuestionDraft => ({ text: "", options: ["", "", "", ""], correct: 0 });
const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Last one standing's questions (D270): a card per question, four option boxes (two needed),
 * and a radio for the correct one. Posted as one hidden JSON field, packed by `packQuestions`,
 * so the server validates exactly what it will store. Each card keeps an id of its own, so a
 * move or a delete never hands one question's focus or typing to another.
 */
export function QuestionsEditor({ initial }: { initial: Question[] }) {
  const nextId = useRef(Math.max(initial.length, 1));
  const [items, setItems] = useState<Item[]>(() =>
    initial.length ? initial.map((q, i) => ({ ...toDraft(q), id: i })) : [{ ...blank(), id: 0 }],
  );
  const set = (id: number, patch: Partial<QuestionDraft>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const move = (from: number, to: number) => setItems((xs) => (to < 0 || to >= xs.length ? xs : moveItem(xs, from, to)));
  const add = () => {
    const id = nextId.current++;
    setItems((xs) => [...xs, { ...blank(), id }]);
  };

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="questions" value={JSON.stringify(packQuestions(items))} />
      {items.length === 0 && <p className="text-sm text-muted-foreground">No questions yet.</p>}
      {items.map((q, i) => (
        <div key={q.id} role="group" aria-label={`Question ${i + 1}`} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">Question {i + 1}</span>
            <span className="ml-auto flex gap-1">
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move question ${i + 1} up`} onClick={() => move(i, i - 1)} disabled={i === 0}><ArrowUp /></Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move question ${i + 1} down`} onClick={() => move(i, i + 1)} disabled={i === items.length - 1}><ArrowDown /></Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete question ${i + 1}`} onClick={() => setItems((xs) => xs.filter((x) => x.id !== q.id))}><Trash2 /></Button>
            </span>
          </div>
          <input className={input} value={q.text} maxLength={200} placeholder="The question" aria-label={`Question ${i + 1}`}
            onChange={(e) => set(q.id, { text: e.target.value })} />
          <div className="grid gap-2 sm:grid-cols-2">
            {q.options.map((o, k) => (
              <div key={k} className="flex items-center gap-2">
                <input type="radio" name={`correct-${q.id}`} checked={q.correct === k} onChange={() => set(q.id, { correct: k })}
                  aria-label={`Option ${OPTION_STYLES[k].letter} is correct`} className="size-4" />
                <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded text-xs font-bold text-white" style={{ background: OPTION_STYLES[k].colour }}>
                  {OPTION_STYLES[k].letter}
                </span>
                <input className={input} value={o} maxLength={60} placeholder={k < 2 ? "Option" : "Option (optional)"}
                  aria-label={`Question ${i + 1}, option ${OPTION_STYLES[k].letter}`}
                  onChange={(e) => set(q.id, { options: q.options.map((x, m) => (m === k ? e.target.value : x)) })} />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Tick the correct answer.</p>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" onClick={add} disabled={items.length >= 50}>
          <Plus />Add question
        </Button>
      </div>
    </div>
  );
}
