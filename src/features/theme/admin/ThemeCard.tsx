"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { EventTheme, HeadingReach, ThemeColorKey } from "../client";
import { adjustedNote, FIELD_NAMES, pickerValue, postedValue, primaryNote, REACH_FIELD, reachHint, withOverride, withReach, type ThemeField } from "./card-state";
import { ThemePreview, type PreviewEvent } from "./ThemePreview";

const WORKED_OUT: { key: ThemeColorKey; label: string }[] = [
  { key: "card", label: "Cards" },
  { key: "text", label: "Text" },
  { key: "muted_text", label: "Secondary text" },
  { key: "border", label: "Borders" },
  { key: "heading", label: "Headings" },
];

const REACH: { value: HeadingReach; label: string }[] = [
  { value: "titles", label: "Page titles only" },
  { value: "titles_and_cards", label: "Page titles and card titles" },
];

const SWATCH = "h-9 w-16 shrink-0 cursor-pointer p-1";

/** One colour: a swatch showing what attendees get, its Reset, and the note when it is shown adjusted. */
function ColourRow({ label, name, value, onPick, reset, resetLabel = "Reset", note, children }: {
  label: string;
  /** Only the primary colour posts its swatch; the theme's swatches post through hidden fields. */
  name?: string;
  value: string;
  onPick: (hex: string) => void;
  reset: (() => void) | null;
  resetLabel?: string;
  note?: string | null;
  children?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1">
        <Input id={id} type="color" name={name} value={value} onChange={(e) => onPick(e.target.value)} className={SWATCH} />
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
        {reset && <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={reset}>{resetLabel}</Button>}
      </div>
      {children}
    </div>
  );
}

/**
 * D626, D631: the event's colours in Settings → Details, saved with Save settings. The theme is
 * held here and drawn only through card-state's helpers (the tested logic is the logic that runs);
 * the preview follows every pick before anything is saved. Every save posts all seven theme
 * fields - the ones not set post "" - so saving another tab never wipes the stored theme.
 */
export function ThemeCard({ theme: saved, primaryColor, event, className = "" }: {
  theme: EventTheme;
  primaryColor: string;
  event: PreviewEvent;
  className?: string;
}) {
  const [theme, setTheme] = useState(saved);
  // Lower-case, as the colour input reports it, so the preview and the post agree.
  const [primary, setPrimary] = useState(primaryColor.toLowerCase());
  const pick = (key: ThemeField) => (hex: string | null) => setTheme((t) => withOverride(t, key, hex));

  return (
    <Card className={`@container ${className}`}>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>Colours for everything attendees see. Set the background and primary colour; the rest is worked out, and you can change any of it.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-start">
        <div className="flex flex-col">
          <ColourRow label="Background" value={pickerValue(theme, "background")} onPick={pick("background")}
            reset={postedValue(theme, "background") ? () => pick("background")(null) : null} resetLabel="Reset to default" />

          {/* Moved here from the Event card (D631); it keeps exactly its meaning (D622). */}
          <ColourRow label="Primary colour" name="primary_color" value={primary} onPick={setPrimary} reset={null}
            note={["Buttons, links and highlights", primaryNote(theme, primary)].filter(Boolean).join(" · ")} />

          {WORKED_OUT.map(({ key, label }) => (
            <ColourRow key={key} label={label} value={pickerValue(theme, key)} onPick={pick(key)}
              reset={postedValue(theme, key) ? () => pick(key)(null) : null}
              note={adjustedNote(theme, primary, key)}>
              {key === "heading" && (
                <fieldset className="flex flex-col gap-2 pl-[76px]">
                  <legend className="mb-2 text-sm text-muted-foreground">Use the heading colour for</legend>
                  {REACH.map((r) => (
                    <label key={r.value} className="flex min-h-9 items-center gap-2 text-sm">
                      <input type="radio" name={REACH_FIELD} value={r.value} checked={theme.heading_reach === r.value}
                        onChange={() => setTheme((t) => withReach(t, r.value))} className="size-4 accent-primary" />
                      {r.label}
                    </label>
                  ))}
                  {reachHint(theme) && <p className="text-xs text-muted-foreground">{reachHint(theme)}</p>}
                </fieldset>
              )}
            </ColourRow>
          ))}

          {/* Last, so the first row keeps `first:`. */}
          {(Object.keys(FIELD_NAMES) as ThemeField[]).map((key) => (
            <input key={key} type="hidden" name={FIELD_NAMES[key]} value={postedValue(theme, key)} />
          ))}
        </div>
        <ThemePreview theme={theme} primary={primary} event={event} />
      </CardContent>
    </Card>
  );
}
