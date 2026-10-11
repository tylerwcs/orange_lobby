"use client";
import { useState } from "react";
import { MEDIA_BUCKET } from "@/lib/storage";
import { browserStorage } from "@/lib/supabase/browser";
import { wallBackgroundUploadAction } from "./actions";
import type { WallBackground } from "../lib/settings";

/** The wall's background (D484): the event colour, or an uploaded image or looping video. Uploads before Save (D300). */
export function WallBackgroundField({ eventId, activityId, current }: { eventId: string; activityId: string; current: WallBackground | null }) {
  const [bg, setBg] = useState<WallBackground | null>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const r = await wallBackgroundUploadAction(eventId, activityId, file.type, file.size);
      if (!r.ok) { setError(r.error); return; }
      const { error: upload } = await browserStorage().storage.from(MEDIA_BUCKET)
        .uploadToSignedUrl(r.path, r.token, file, { contentType: file.type, cacheControl: "31536000" });
      if (upload) { setError("Could not upload that file. Try again."); return; }
      setBg({ type: r.kind, url: r.url });
    } catch {
      setError("Could not upload that file. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-bold">Wall background</legend>
      <input type="hidden" name="background_type" value={bg ? bg.type : "none"} />
      <input type="hidden" name="background_url" value={bg?.url ?? ""} />
      <p className="text-sm text-muted-foreground">
        {bg ? `Your ${bg.type}. ` : "The event colour. "}An image or an MP4/WebM up to 30 MB; it fills the LED, so 5504 × 2322 or 2560 × 1080 fits KOM&apos;s screen.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm font-medium">
          {busy ? "Uploading…" : bg ? "Replace" : "Upload"}
          <input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" className="sr-only" disabled={busy}
            onChange={(e) => void choose(e.target.files?.[0])} />
        </label>
        {bg && <button type="button" className="h-8 px-3 text-sm font-medium text-destructive" onClick={() => setBg(null)}>Use the event colour</button>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}
