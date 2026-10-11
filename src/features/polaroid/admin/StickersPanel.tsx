import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PolaroidSettings } from "../lib/settings";
import { BUILTIN_STICKERS } from "../lib/stickers";
import { addStickerAction, deleteStickerAction, toggleBuiltinStickerAction } from "./actions";

/** D485: the event's own stickers, and the built-in pack with a show/hide each. */
export function StickersPanel({ eventId, activityId, settings }: { eventId: string; activityId: string; settings: PolaroidSettings }) {
  const hidden = new Set(settings.hidden_builtin);
  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Event stickers</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={addStickerAction.bind(null, eventId, activityId)} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Image
              <input type="file" name="sticker" accept="image/png,image/webp,image/svg+xml" className="text-sm font-normal" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Name (optional)
              <input name="name" maxLength={60} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm font-normal shadow-xs" />
            </label>
            <SubmitButton>Add sticker</SubmitButton>
          </form>
          <p className="text-xs text-muted-foreground">PNG, WebP or SVG with a transparent background, up to 1 MB. They come first in the tray.</p>
          {settings.stickers.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {settings.stickers.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.url} alt="" className="size-10 object-contain" />
                  <span className="flex-1 text-sm">{s.name}</span>
                  <form action={deleteStickerAction.bind(null, eventId, activityId, s.id)}>
                    <ConfirmButton message="Polaroids that already use it keep everything else.">Delete</ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Built-in pack</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3">
            {BUILTIN_STICKERS.map((s) => (
              <form key={s.id} action={toggleBuiltinStickerAction.bind(null, eventId, activityId, s.id)}
                className={`flex flex-col items-center gap-1 rounded-lg border p-2 ${hidden.has(s.id) ? "opacity-40" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.src} alt="" className="size-12 object-contain" />
                <span className="text-xs">{s.name}</span>
                <SubmitButton variant="outline" size="sm">{hidden.has(s.id) ? "Show" : "Hide"}</SubmitButton>
              </form>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
