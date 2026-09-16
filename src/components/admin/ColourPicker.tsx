import { AGENDA_COLOURS } from "@/lib/agenda-colours";

/**
 * The colour a session carries on the agenda.
 *
 * Radios rather than a select, because the thing being chosen is the swatch: a dropdown
 * listing the word "Plum" asks an organiser to remember what plum looked like on the last
 * session they set. Each swatch keeps its name as its accessible label, so the control is
 * usable without seeing colour at all — which is the point of not relying on hue alone.
 */
export function ColourPicker({ name = "color", defaultValue }: { name?: string; defaultValue?: string | null }) {
  const current = defaultValue ?? "";
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">Colour</legend>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-input px-3.5 text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:text-accent-foreground">
          <input type="radio" name={name} value="" defaultChecked={current === ""} className="size-4 accent-primary" />
          None
        </label>
        {AGENDA_COLOURS.map((c) => (
          <label
            key={c.key}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-input px-3.5 text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:text-accent-foreground"
          >
            <input type="radio" name={name} value={c.key} defaultChecked={current === c.key} className="size-4 accent-primary" />
            <span aria-hidden="true" className={`size-3.5 rounded-full ${c.className}`} />
            {c.label}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Groups sessions on the agenda. Attendees see it too.</p>
    </fieldset>
  );
}
