"use client";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/features/language/client";

type Variant = React.ComponentProps<typeof Button>["variant"];

/**
 * Button has no isPending of its own - the shadcn way is to compose it with Spinner and
 * disabled, which is what this does once for every form in the admin.
 */
/**
 * `formAction` lets one form carry a second submit that posts somewhere else — the plain
 * HTML mechanism, which React wires to a Server Action. The info page uses it so its image
 * upload can post the textarea's unsaved content along with the file.
 *
 * Note that `pending` comes from the FORM, not from the button, so every submit in a form
 * shows its working state together. That is the honest reading: the form is submitting, and
 * which button started it does not change what the organiser should wait for.
 */
export function SubmitButton({ children, className = "", variant = "default", formAction, ...rest }: {
  children: React.ReactNode;
  className?: string;
  variant?: Variant;
  formAction?: (formData: FormData) => void | Promise<void>;
} & Pick<React.ComponentProps<typeof Button>, "size" | "aria-current">) {
  const { pending } = useFormStatus();
  // D741: in the portal, the attendee's language; anywhere without the provider (admin), English.
  const working = useT().common.working;
  return (
    <Button type="submit" formAction={formAction} variant={variant} disabled={pending} aria-busy={pending} className={className} {...rest}>
      {pending && <Spinner data-icon="inline-start" />}
      {pending ? working : children}
    </Button>
  );
}
