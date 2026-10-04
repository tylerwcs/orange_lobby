import type { Attendee } from "@/lib/types";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

const inputClass = "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * D392: who an entry is for, at the top of the submit form, for someone who may submit for their
 * group. Themselves first while their own entry is open; otherwise the first member. Posted as
 * `:for` - a colon, so no question key can collide with it.
 */
export function SubmitFor({ members, self }: { members: Pick<Attendee, "id" | "name">[]; self: boolean }) {
  return (
    <Field>
      <FieldLabel htmlFor="submit-for">Submitting for</FieldLabel>
      <select id="submit-for" name=":for" defaultValue={self ? "" : members[0]?.id} className={inputClass}>
        {self && <option value="">Myself</option>}
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <FieldDescription>It counts as theirs, and says you added it.</FieldDescription>
    </Field>
  );
}
