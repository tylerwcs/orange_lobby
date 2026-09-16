"use client";
import { useId, useRef, useState } from "react";
import { ImageUp, Undo2, X } from "lucide-react";
import { Field as UIField, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { acceptImage, IMAGE_ACCEPT } from "@/lib/storage";

/**
 * One uploaded image: what is stored now, what is about to replace it, and a way to take
 * it away.
 *
 * A bare file input says only that a file was chosen. That is the wrong thing to show an
 * organiser about to publish a logo: they need to see the image, see that it is not yet
 * saved, and be able to change their mind. So the thumbnail switches to the picked file
 * the moment it is chosen, wears a ring while it is only a pick, and keeps the image it
 * would replace beside it until Save makes it real.
 *
 * Removal is a checkbox rather than its own button because these fields live inside a
 * larger form that saves as one — a button would have to submit, and submitting the tile
 * editor to drop its image would throw away everything else typed alongside it. It hides
 * once a replacement is chosen, which is the same answer to a different question.
 *
 * The picked file is checked here against the very rules the Server Action will apply,
 * imported rather than restated, so "that is not an image we take" arrives while the file
 * chooser is still warm instead of after a round trip. The action checks again regardless:
 * this is feedback, not a gate.
 */
export function ImageField({ label, name, url, description }: {
  label: string;
  name: string;
  url?: string | null;
  description?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<{ src: string; name: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  /** Forgets the preview only. The chosen file stays in the input, which is what posts it. */
  function forget() {
    if (picked) URL.revokeObjectURL(picked.src);
    setPicked(null);
  }

  /**
   * Undo, and the answer to a file we will not take.
   *
   * Emptying `input.value` is the only way to unchoose a file, so it must happen here and
   * nowhere else — doing it on every change would throw away the selection the browser
   * had just made and leave a preview of a file the form no longer carries.
   */
  function drop() {
    forget();
    if (input.current) input.current.value = "";
  }

  function choose(file: File | undefined) {
    forget();
    if (!file) return;
    try {
      acceptImage(file);
    } catch (e) {
      // Saying why is half of it; the other half is making sure a file we will not send
      // does not sit in the form looking like it is going somewhere.
      setError((e as Error).message);
      drop();
      return;
    }
    setError(null);
    setRemoving(false);
    setPicked({ src: URL.createObjectURL(file), name: file.name, size: file.size });
  }

  const shown = picked?.src ?? url ?? null;
  const gone = removing && !picked;

  return (
    <UIField>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>

      <div className="flex flex-wrap items-center gap-3">
        {shown && (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shown}
              alt=""
              className={`size-14 shrink-0 rounded-md border bg-muted object-contain transition-opacity ${picked ? "border-primary ring-2 ring-primary/30" : "border-border"} ${gone ? "opacity-40" : ""}`}
            />
            {/* What it replaces, kept in view until Save makes the swap real. */}
            {picked && url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" title="The image this replaces" className="size-8 shrink-0 rounded border border-border bg-muted object-contain opacity-40" />
            )}
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
              <ImageUp aria-hidden />
              {shown && !gone ? "Replace image" : "Choose image"}
            </Button>
            {picked && (
              <Button type="button" variant="ghost" size="sm" onClick={drop}>
                <Undo2 aria-hidden />
                Undo
              </Button>
            )}
            {url && !picked && (
              <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  name={`${name}_remove`}
                  checked={removing}
                  onChange={(e) => setRemoving(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Remove on save
              </label>
            )}
          </div>

          {picked && (
            <p className="min-w-0 truncate text-xs font-medium text-primary">
              New · {picked.name} · {formatSize(picked.size)} — saves when you press Save
            </p>
          )}
          {gone && <p className="text-xs font-medium text-destructive">Removed when you press Save.</p>}
        </div>
      </div>

      <input
        ref={input}
        id={id}
        name={name}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        onChange={(e) => choose(e.target.files?.[0])}
      />

      {error ? (
        <FieldError>
          <span className="inline-flex items-center gap-1"><X aria-hidden className="size-3.5" />{error}</span>
        </FieldError>
      ) : (
        <FieldDescription>
          {description ? `${description} ` : ""}PNG, JPEG, WebP or SVG, up to 4 MB.
        </FieldDescription>
      )}
    </UIField>
  );
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
