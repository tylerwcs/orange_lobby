"use client";
import { useState } from "react";
import type { Background, BackgroundKind } from "../background";
import { acceptVideo, MEDIA_BUCKET, VIDEO_ACCEPT } from "@/lib/storage";
import { browserStorage } from "@/lib/supabase/browser";
import { ImageField } from "@/components/admin/ImageField";
import { backgroundVideoUploadAction } from "@/app/admin/events/[id]/games/actions";

const OPTIONS: { kind: BackgroundKind; label: string; help: string }[] = [
  { kind: "theme", label: "Theme", help: "A moving background in the event colour, with the logo." },
  { kind: "green", label: "Green screen", help: "Solid green for the AV team to key out." },
  { kind: "image", label: "Image", help: "Your own picture, darkened a little so text stays readable." },
  { kind: "video", label: "Video", help: "A looping MP4 or WebM, up to 30 MB, played without sound." },
];

/** A game's LED background (D297–D300). An image posts with the form; a video uploads on its own first. */
export function BackgroundPicker({ eventId, gameId, current }: { eventId: string; gameId: string; current: Background }) {
  const [kind, setKind] = useState<BackgroundKind>(current.kind);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-sm font-bold">LED background</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <label key={o.kind} className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm ${kind === o.kind ? "border-primary bg-primary/5" : "border-border"}`}>
            <span className="flex items-center gap-2 font-bold">
              <input type="radio" name="background_kind" value={o.kind} checked={kind === o.kind} onChange={() => setKind(o.kind)} className="size-4" />
              {o.label}
            </span>
            <span className="text-xs text-muted-foreground">{o.help}</span>
          </label>
        ))}
      </div>
      {kind === "image" && (
        <ImageField label="Background image" name="background_image" url={current.kind === "image" ? current.url : null}
          description="PNG, JPEG or WebP, up to 4 MB. 1920 × 1080 fits the LED exactly." />
      )}
      {kind === "video" && <VideoField eventId={eventId} gameId={gameId} current={current.kind === "video" ? current.url : null} />}
    </fieldset>
  );
}

/**
 * The video goes straight to the bucket with a signed URL the server mints after checking its
 * type and size (D300): it is too big for the form. Save then keeps the URL it landed at.
 */
function VideoField({ eventId, gameId, current }: { eventId: string; gameId: string; current: string | null }) {
  const [url, setUrl] = useState(current);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      acceptVideo(file);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setUploading(true);
    try {
      const r = await backgroundVideoUploadAction(eventId, gameId, file.type, file.size);
      if (!r.ok) { setError(r.error); return; }
      const { error: upload } = await browserStorage().storage.from(MEDIA_BUCKET)
        .uploadToSignedUrl(r.path, r.token, file, { contentType: file.type, cacheControl: "31536000" });
      if (upload) { setError("Could not upload that video. Try again."); return; }
      setUrl(r.url);
    } catch {
      setError("Could not upload that video. Check the connection and try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="background_video" value={url ?? ""} />
      {url && <video src={url} muted loop autoPlay playsInline className="aspect-video w-full max-w-md rounded-lg bg-black object-cover" />}
      {/* No name: the file itself never rides the form. */}
      <input type="file" accept={VIDEO_ACCEPT} disabled={uploading} onChange={(e) => void choose(e.target.files?.[0])} className="text-sm" />
      <p className="text-xs text-muted-foreground">{uploading ? "Uploading… keep this page open." : "MP4 or WebM, up to 30 MB. It uploads straight away; Save keeps it."}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
