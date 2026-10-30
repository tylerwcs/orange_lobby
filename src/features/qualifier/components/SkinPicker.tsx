"use client";
import { useState, useTransition } from "react";
import { chooseSkinAction } from "@/app/e/[slug]/(portal)/a/[token]/qualifier/actions";
import { SKINS, type SkinId } from "../progress";
import { skinColour } from "../screen";

/**
 * The ship colour (D774): every skin as a swatch, the unlocked ones tappable. The choice shows
 * at once and is saved by the server, which checks the skin really is unlocked; if the save
 * fails the previous colour comes back. A player with no choice yet flies violet.
 */
export function SkinPicker({ slug, token, skins, skin, onChosen }: {
  slug: string; token: string; skins: SkinId[]; skin: SkinId | null; onChosen(skin: SkinId | null): void;
}) {
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const current = skin ?? "violet";
  const choose = (next: SkinId) => {
    if (next === current || pending) return;
    const before = skin;
    setFailed(false);
    onChosen(next);
    start(async () => {
      const ok = await chooseSkinAction(slug, token, next).then((r) => r.ok, () => false);
      if (!ok) {
        setFailed(true);
        onChosen(before);
      }
    });
  };
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-2" aria-label="Ship colours">
        {SKINS.map((s) => {
          const open = skins.includes(s);
          return (
            <li key={s}>
              <button type="button" disabled={!open || pending} aria-pressed={open ? s === current : undefined}
                aria-label={open ? `${s} ship` : `${s} ship, locked`} onClick={() => choose(s)}
                className={`flex size-11 items-center justify-center rounded-full border-2 transition-opacity ${s === current && open ? "border-foreground" : "border-transparent"} ${open ? "" : "opacity-30"}`}>
                <span aria-hidden className="size-7 rounded-full" style={{ background: skinColour(s) }} />
              </button>
            </li>
          );
        })}
      </ul>
      {failed && <p role="alert" className="text-sm text-destructive">Could not save that colour. Try again.</p>}
    </div>
  );
}
