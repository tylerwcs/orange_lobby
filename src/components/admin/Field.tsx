import { useId } from "react";
import { Field as UIField, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
        : <Input id={id} name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} />}
      {description && <FieldDescription>{description}</FieldDescription>}
    </UIField>
  );
}
