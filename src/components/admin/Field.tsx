import { useId } from "react";
import { Field as UIField, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * How wide a control is when its value has a known shape. A date is ten characters however
 * wide the card is; stretching it to fill a column only pushes the next field away, and a
 * colour input drawn full width is a long bar rather than a swatch. Free text stops at
 * max-w-md, past which a line is harder to read than to type.
 *
 * Important (`!`) because the ui Field stretches every child with `*:w-full`, which lands
 * later in the stylesheet than a plain width and would win.
 */
const WIDTH: Record<string, string> = {
  date: "w-44!",
  "datetime-local": "w-60!",
  time: "w-32!",
  number: "w-32!",
  color: "w-24!",
};

/**
 * One labelled control. The signature is unchanged from the hand-rolled version so every
 * call site kept working through the shadcn migration; only the insides moved onto
 * Field/FieldLabel/Input, which is what gives the whole admin its form behaviour -
 * focus rings, invalid styling, and a label genuinely bound to its control by id rather
 * than by being wrapped around it.
 */
export function Field({ label, name, type = "text", defaultValue, placeholder, textarea, description }: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | null;
  placeholder?: string;
  textarea?: boolean;
  description?: string;
}) {
  const id = useId();
  return (
    <UIField>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {textarea
        ? <Textarea id={id} name={name} defaultValue={defaultValue ?? ""} placeholder={placeholder} rows={4} />
        : <Input id={id} name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} className={WIDTH[type] ?? "max-w-md"} />}
      {description && <FieldDescription>{description}</FieldDescription>}
    </UIField>
  );
}
