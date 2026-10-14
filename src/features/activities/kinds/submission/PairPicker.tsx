import type { PairTeam } from "../../lib/pairs";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

const inputClass = "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * D530: tag one person from another team, by team. "No one" first, so leaving it alone is an
 * ordinary entry. Posted as `:with` - a colon, so no question key can collide with it.
 */
export function PairPicker({ teams }: { teams: PairTeam[] }) {
  return (
    <Field>
      <FieldLabel htmlFor="submit-with">Did this with someone from another team?</FieldLabel>
      <select id="submit-with" name=":with" defaultValue="" className={inputClass}>
        <option value="">No one</option>
        {teams.map((t) => (
          <optgroup key={t.id} label={t.name}>
            {t.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </optgroup>
        ))}
      </select>
      <FieldDescription>They get this entry too, for their team.</FieldDescription>
    </Field>
  );
}
