"use client";
import { useState } from "react";
import { DRAW_FORMAT_LABELS, DRAW_FORMATS, MAX_CARDS, type DrawFormat } from "@/lib/games/config";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const HELP: Record<DrawFormat, string> = {
  slot: "Reels spin through names and land on the winners. Draw one at a time or a whole prize at once.",
  wheel: "Every eligible name on a wheel. One winner per spin.",
  mosaic: "Everyone as a tile. Each round fades out a share until only the winners stand. The host presses Next round.",
  cards: `Draw a person, then they pick one of the face-down cards and win what it hides. One card per prize, up to ${MAX_CARDS}.`,
};

/** A draw's format, spin time and rounds (D310, D311, D315). Both numbers always post; each shows only where it applies. */
export function DrawFormatFields({ format, spinS, rounds }: { format: DrawFormat; spinS: number; rounds: number }) {
  const [f, setF] = useState(format);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-sm font-bold">Format</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {DRAW_FORMATS.map((k) => (
          <label key={k} className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm ${f === k ? "border-primary bg-primary/5" : "border-border"}`}>
            <span className="flex items-center gap-2 font-bold">
              <input type="radio" name="format" value={k} checked={f === k} onChange={() => setF(k)} className="size-4" />
              {DRAW_FORMAT_LABELS[k]}
            </span>
            <span className="text-xs text-muted-foreground">{HELP[k]}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        <label className={`flex flex-col gap-1.5 text-sm font-bold ${f === "mosaic" ? "hidden" : ""}`}>
          Spin time (seconds)
          <input name="spin_s" type="number" min={3} max={20} defaultValue={spinS} className={`${input} max-w-32 tabular-nums`} />
        </label>
        <label className={`flex flex-col gap-1.5 text-sm font-bold ${f === "mosaic" ? "" : "hidden"}`}>
          Rounds
          <input name="rounds" type="number" min={2} max={8} defaultValue={rounds} className={`${input} max-w-32 tabular-nums`} />
        </label>
      </div>
    </fieldset>
  );
}
