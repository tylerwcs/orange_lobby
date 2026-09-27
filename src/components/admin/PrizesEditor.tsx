"use client";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { moveItem } from "@/lib/reorder";
import type { Prize } from "@/lib/games/config";

type Item = { id: number; name: string; quantity: string };

const input = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** The draw's prizes, drawn top to bottom (D279): put the grand prize last. Posted as one hidden JSON field. */
export function PrizesEditor({ initial }: { initial: Prize[] }) {
  const nextId = useRef(Math.max(initial.length, 1));
  const [items, setItems] = useState<Item[]>(() =>
    initial.length ? initial.map((p, i) => ({ id: i, name: p.name, quantity: String(p.quantity) })) : [{ id: 0, name: "", quantity: "1" }],
  );
  const packed = items.map((p) => ({ name: p.name, quantity: Number.parseInt(p.quantity, 10) || 0 }));
  const set = (id: number, patch: Partial<Omit<Item, "id">>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const move = (from: number, to: number) => setItems((xs) => (to < 0 || to >= xs.length ? xs : moveItem(xs, from, to)));
  const add = () => {
    const id = nextId.current++;
    setItems((xs) => [...xs, { id, name: "", quantity: "1" }]);
  };

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="prizes" value={JSON.stringify(packed)} />
      {items.length === 0 && <p className="text-sm text-muted-foreground">No prizes yet.</p>}
      {items.map((p, i) => (
        <div key={p.id} className="flex items-center gap-2">
          <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
          <input className={`${input} min-w-0 flex-1`} value={p.name} maxLength={80} placeholder="Prize" aria-label={`Prize ${i + 1}`}
            onChange={(e) => set(p.id, { name: e.target.value })} />
          <input className={`${input} w-20 tabular-nums`} value={p.quantity} inputMode="numeric" aria-label={`How many of prize ${i + 1}`}
            onChange={(e) => set(p.id, { quantity: e.target.value.replace(/\D/g, "") })} />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move prize ${i + 1} up`} onClick={() => move(i, i - 1)} disabled={i === 0}><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move prize ${i + 1} down`} onClick={() => move(i, i + 1)} disabled={i === items.length - 1}><ArrowDown /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete prize ${i + 1}`} onClick={() => setItems((xs) => xs.filter((x) => x.id !== p.id))}><Trash2 /></Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" onClick={add} disabled={items.length >= 50}>
          <Plus />Add prize
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Drawn from the top down — put the grand prize last.</p>
    </div>
  );
}
