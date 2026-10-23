"use client";
import { useId, useState } from "react";
import { SaveBar } from "@/components/admin/SaveBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MEDIA_BUCKET } from "@/lib/storage";
import { browserStorage } from "@/lib/supabase/browser";
import { PolaroidCard } from "../components/PolaroidCard";
import { cardLook } from "../lib/look";
import type { CardSettings } from "../lib/settings";
import { printImageUploadAction, savePrintLookAction } from "./actions";

type Part = "background" | "logo";

/** Two made-up photos for the sample, one each way round, so the admin sees how the background is cut. */
const scene = (w: number, h: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6c27a"/><stop offset=".6" stop-color="#c8678a"/><stop offset="1" stop-color="#3d4f8f"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#s)"/><circle cx="${w * 0.68}" cy="${h * 0.42}" r="${Math.min(w, h) * 0.13}" fill="#fff3d6"/><path d="M0 ${h * 0.78} Q${w * 0.3} ${h * 0.62} ${w * 0.6} ${h * 0.76} T${w} ${h * 0.7} V${h} H0Z" fill="#2a2f55"/></svg>`,
  )}`;
const SAMPLES = [
  { src: scene(400, 300), w: 400, h: 300, message: "Best night ever!", stickers: [], tilt: -2 },
  { src: scene(300, 400), w: 300, h: 400, message: "Best night ever!", stickers: [], tilt: 2 },
];
const SWATCH = "h-9 w-16 shrink-0 cursor-pointer p-1";

/**
 * D718: how every polaroid on this wall is printed: a background image in place of the white
 * frame, a logo under the message, and the message's colour. Images upload before Save (D300);
 * the sample beside the fields shows the look as it stands, before it is saved.
 */
export function PrintLookCard({ eventId, activityId, card }: { eventId: string; activityId: string; card: CardSettings }) {
  const [look, setLook] = useState<CardSettings>(card);
  const [busy, setBusy] = useState<Part | null>(null);
  const [error, setError] = useState<string | null>(null);
  const colourId = useId();
  const drawn = cardLook(look);

  const choose = async (part: Part, file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(part);
    try {
      const r = await printImageUploadAction(eventId, activityId, part, file.type, file.size);
      if (!r.ok) { setError(r.error); return; }
      const { error: upload } = await browserStorage().storage.from(MEDIA_BUCKET)
        .uploadToSignedUrl(r.path, r.token, file, { contentType: file.type, cacheControl: "31536000" });
      if (upload) { setError("Could not upload that file. Try again."); return; }
      setLook((l) => ({ ...l, [part]: r.url }));
    } catch {
      setError("Could not upload that file. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const upload = (part: Part, label: string, hint: string) => (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-bold">{label}</legend>
      <input type="hidden" name={`card_${part}`} value={look[part] ?? ""} />
      <p className="text-sm text-muted-foreground">{hint}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm font-medium">
          {busy === part ? "Uploading…" : look[part] ? "Replace" : "Upload"}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" disabled={busy !== null}
            onChange={(e) => void choose(part, e.target.files?.[0])} />
        </label>
        {look[part] && (
          <button type="button" className="h-8 px-3 text-sm font-medium text-destructive" onClick={() => setLook((l) => ({ ...l, [part]: null }))}>Remove</button>
        )}
      </div>
    </fieldset>
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Print look</CardTitle>
        <CardDescription>How every polaroid on this wall is printed: on the phone, the LED and here. Leave it empty for the white polaroid.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={savePrintLookAction.bind(null, eventId, activityId)} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex flex-col gap-5">
              {upload("background", "Background", "Fills the whole polaroid in place of the white frame, cut to each photo's shape, so keep the art near the edges. PNG, JPEG or WebP up to 4 MB; portrait, about 1500 × 2000, fits best.")}
              {upload("logo", "Logo", "Printed under the message. A wide logo on a transparent background (PNG, WebP or SVG) reads best.")}
              <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1">
                <input type="hidden" name="card_ink" value={look.ink ?? ""} />
                <Input id={colourId} type="color" value={drawn.ink} onChange={(e) => setLook((l) => ({ ...l, ink: e.target.value }))} className={SWATCH} />
                <label htmlFor={colourId} className="text-sm font-bold">Message colour</label>
                {look.ink === null
                  ? <span className="text-xs text-muted-foreground">Automatic: {look.background ? "white" : "dark grey"}</span>
                  : <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setLook((l) => ({ ...l, ink: null }))}>Reset</Button>}
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </div>
            <figure className="flex flex-col items-center gap-3 rounded-lg bg-muted px-4 pb-3 pt-6">
              <div className="flex items-start justify-center gap-4">
                {SAMPLES.map((s, i) => <PolaroidCard key={i} card={s} width={150} stickerSrc={{}} look={drawn} />)}
              </div>
              <figcaption className="text-xs text-muted-foreground">Sample, before you save</figcaption>
            </figure>
          </div>
          <SaveBar inCard />
        </form>
      </CardContent>
    </Card>
  );
}
