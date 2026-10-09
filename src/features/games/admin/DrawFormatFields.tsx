"use client";
import { useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DRAW_FORMAT_LABELS, DRAW_FORMATS, MAX_CARDS, type DrawFormat } from "../config";
import { acceptImage, IMAGE_ACCEPT, MEDIA_BUCKET } from "@/lib/storage";
import { browserStorage } from "@/lib/supabase/browser";
import { gameImageUploadAction } from "@/app/admin/events/[id]/games/actions";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const HELP: Record<DrawFormat, string> = {
  slot: "Reels spin through names and land on the winners. Draw one at a time or a whole prize at once.",
  wheel: "Every eligible name on a wheel. One winner per spin.",
  mosaic: "Everyone as a tile. Each round fades out a share until only the winners stand. The host presses Next round.",
  cards: `Draw a person, then they pick one of the face-down cards and win what it hides. One card per prize, up to ${MAX_CARDS}.`,
};

/**
 * A draw's format, spin time and rounds (D310, D311, D315), plus a card round's back (D323).
 * Both numbers always post; each shows only where it applies. The card back field lives here
 * because the format only exists as state inside this component.
 *
 * CardBackField is always mounted, just hidden with a class when the format isn't cards — the
 * same trick as the spin_s/rounds fields above. It must NOT be conditionally rendered
 * (`f === "cards" && <CardBackField .../>`): an unmounted field posts nothing, so switching the
 * radio away from Cards would make its hidden `card_back` input vanish from the form entirely.
 * configFromForm reads that as an explicit clear (empty string -> null, the same as ticking
 * nothing), and updateGameAction would then delete the very card back that switching formats
 * and switching back was supposed to leave untouched — along with losing a just-uploaded one
 * that never got the chance to be saved.
 */
export function DrawFormatFields({ format, spinS, rounds, eventId, gameId, cardBack }: {
  format: DrawFormat; spinS: number; rounds: number; eventId: string; gameId: string; cardBack: string | null;
}) {
  const [f, setF] = useState(format);
  return (
    <>
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
      <div className={`flex flex-col gap-1.5 ${f === "cards" ? "" : "hidden"}`}>
        <span className="text-sm font-bold">Card back image</span>
        <CardBackField eventId={eventId} gameId={gameId} current={cardBack} />
      </div>
    </>
  );
}

/**
 * The card round's back (D317, D323): too big a picture for the form, so it goes straight to
 * the bucket with a signed URL the server mints after checking its type and size — the same
 * shape as BackgroundPicker's VideoField. Save keeps the URL it landed at.
 */
function CardBackField({ eventId, gameId, current }: { eventId: string; gameId: string; current: string | null }) {
  const [url, setUrl] = useState(current);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

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
      const r = await gameImageUploadAction(eventId, gameId, "card-back", file.type, file.size);
      if (!r.ok) { setError(r.error); return; }
      const { error: upload } = await browserStorage().storage.from(MEDIA_BUCKET)
        .uploadToSignedUrl(r.path, r.token, file, { contentType: file.type, cacheControl: "31536000" });
      if (upload) { setError("Could not upload that image. Try again."); return; }
      setUrl(r.url);
    } catch {
      setError("Could not upload that image. Check the connection and try again.");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="card_back" value={url ?? ""} />
      {url && (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-24 w-16 rounded-md border border-border bg-muted object-cover" />
          <Button type="button" variant="ghost" size="sm" onClick={() => setUrl(null)}>
            <X aria-hidden />
            Remove
          </Button>
        </div>
      )}
      <input ref={input} type="file" accept={IMAGE_ACCEPT} disabled={uploading} onChange={(e) => void choose(e.target.files?.[0])} className="text-sm" />
      <p className="text-xs text-muted-foreground">
        {uploading ? "Uploading… keep this page open." : "Fills the back of every card. The card number shows on top."}
      </p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
