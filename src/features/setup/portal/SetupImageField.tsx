"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptImage, IMAGE_ACCEPT } from "@/lib/storage";
import { shouldShrink, shrinkImage } from "@/lib/shrink-image";
import { IMAGE_TARGETS, proportionWarning } from "../images";
import { uploadSetupImageAction } from "./actions";

const IMAGE_TYPES = new Set(IMAGE_ACCEPT.split(","));
const WRONG_TYPE = "Images must be PNG, JPEG, WebP or SVG.";
const UPLOAD_FAILED = "Couldn't upload that image — check your connection and try again.";

/**
 * An image the organiser uploads straight away (D447): the URL lands in the answers, which
 * autosave. Shows what attendees will get, and warns - never blocks - when the shape is off.
 */
export function SetupImageField({ token, kind, label, value, onChange, onFocus }: {
  token: string;
  kind: "logo" | "banner";
  label: string;
  value: string;
  onChange: (url: string) => void;
  onFocus: () => void;
}) {
  const target = IMAGE_TARGETS[kind];
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Keyed by the URL it measured, so a removed or replaced image never shows the last one's warning.
  const [measured, setMeasured] = useState<{ url: string; warning: string | null } | null>(null);
  const warning = value && measured?.url === value ? measured.warning : null;
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!value) return;
    const img = new Image();
    img.onload = () => setMeasured({ url: value, warning: proportionWarning(img.naturalWidth, img.naturalHeight, target) });
    img.src = value;
  }, [value, target]);

  // Type first, then shrink (banners only), then the size limit on the file actually sent.
  const pick = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!IMAGE_TYPES.has(file.type.toLowerCase())) { setError(WRONG_TYPE); return; }
    start(async () => {
      // A logo is never shrunk: shrinking re-encodes as JPEG, which loses a PNG's transparency.
      const ready = kind === "banner" && shouldShrink(file) ? await shrinkImage(file) : file;
      try {
        acceptImage(ready);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
      const fd = new FormData();
      fd.set("image", ready);
      try {
        const r = await uploadSetupImageAction(token, kind, fd);
        if (r.ok) onChange(r.url);
        else setError(r.message);
      } catch {
        setError(UPLOAD_FAILED);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2" onFocus={onFocus}>
      <span className="text-sm font-bold">{label}</span>
      <div className="flex items-center gap-3">
        <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted ${kind === "logo" ? "size-16" : "aspect-[3/1] h-16"}`}>
          {value
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={value} alt="" className={`size-full ${kind === "logo" ? "object-contain" : "object-cover"}`} />
            : <span className="text-[10px] text-muted-foreground">{target.best}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} data-setup-field={kind === "logo" ? "logo_url" : "banner_url"} onClick={() => input.current?.click()}>
            {pending ? "Uploading…" : value ? "Replace" : "Choose image"}
          </Button>
          {value && !pending && <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>Remove</Button>}
        </div>
        <input ref={input} type="file" accept={IMAGE_ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <p className="text-xs text-muted-foreground">Best: {target.best}. {target.note} PNG, JPEG, WebP or SVG, up to 4 MB.</p>
      {warning && <p className="text-xs font-semibold text-amber-700">{warning}</p>}
      {error && <p role="alert" className="text-xs font-semibold text-destructive">{error}</p>}
    </div>
  );
}
