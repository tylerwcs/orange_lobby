"use client";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImageUp, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { moveItem } from "@/lib/reorder";
import { acceptImage, IMAGE_ACCEPT, MEDIA_BUCKET } from "@/lib/storage";
import { browserStorage } from "@/lib/supabase/browser";
import type { Prize } from "@/lib/games/config";
import { gameImageUploadAction } from "@/app/admin/events/[id]/games/actions";

type Item = { id: number; name: string; quantity: string; image: string | null };

const input = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The draw's prizes, drawn top to bottom (D279): put the grand prize last. Posted as one hidden
 * JSON field, including each prize's picture (D323), uploaded straight to the bucket like the
 * background video (see BackgroundPicker's VideoField).
 */
export function PrizesEditor({ initial, eventId, gameId }: { initial: Prize[]; eventId: string; gameId: string }) {
  const nextId = useRef(Math.max(initial.length, 1));
  const [items, setItems] = useState<Item[]>(() =>
    initial.length
      ? initial.map((p, i) => ({ id: i, name: p.name, quantity: String(p.quantity), image: p.image }))
      : [{ id: 0, name: "", quantity: "1", image: null }],
  );
  const packed = items.map((p) => ({ name: p.name, quantity: Number.parseInt(p.quantity, 10) || 0, image: p.image }));
  const set = (id: number, patch: Partial<Omit<Item, "id">>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const move = (from: number, to: number) => setItems((xs) => (to < 0 || to >= xs.length ? xs : moveItem(xs, from, to)));
  const add = () => {
    const id = nextId.current++;
    setItems((xs) => [...xs, { id, name: "", quantity: "1", image: null }]);
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
          <PrizePicture eventId={eventId} gameId={gameId} url={p.image} label={`Prize ${i + 1} picture`}
            onChange={(image) => set(p.id, { image })} />
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
      <p className="text-xs text-muted-foreground">Shown on the card when it flips, and beside the prize on the winner screen.</p>
    </div>
  );
}

/**
 * One prize's picture: a thumbnail when set, a button to upload or replace it, and a remove ×.
 * Uploads straight to the bucket with a signed URL the server mints after checking its type and
 * size (D323), the same shape as BackgroundPicker's VideoField — a prize row has no room for
 * ImageField's fuller undo-before-save treatment, so the swap is immediate.
 */
function PrizePicture({ eventId, gameId, url, onChange, label }: {
  eventId: string; gameId: string; url: string | null; onChange: (url: string | null) => void; label: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      acceptImage(file);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setUploading(true);
    try {
      const r = await gameImageUploadAction(eventId, gameId, "prize", file.type, file.size);
      if (!r.ok) { setError(r.error); return; }
      const { error: upload } = await browserStorage().storage.from(MEDIA_BUCKET)
        .uploadToSignedUrl(r.path, r.token, file, { contentType: file.type, cacheControl: "31536000" });
      if (upload) { setError("Could not upload that image. Try again."); return; }
      onChange(r.url);
    } catch {
      setError("Could not upload that image. Check the connection and try again.");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    // flex-wrap + basis-full on the error: a row this narrow has no spare width for an error
    // message beside the thumbnail and buttons, so it wraps onto its own line below them
    // instead of squeezing the rest of the prize row.
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-9 shrink-0 rounded border border-border bg-muted object-contain" />
      )}
      <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={() => input.current?.click()}>
        <ImageUp aria-hidden />
        Picture
      </Button>
      {url && (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${label.toLowerCase()}`} onClick={() => onChange(null)}>
          <X aria-hidden />
        </Button>
      )}
      <input ref={input} type="file" accept={IMAGE_ACCEPT} aria-label={label} className="sr-only" onChange={(e) => void choose(e.target.files?.[0])} />
      {error && <p role="alert" className="basis-full text-xs text-destructive">{error}</p>}
    </div>
  );
}
