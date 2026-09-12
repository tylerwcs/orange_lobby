"use client";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Variant = React.ComponentProps<typeof Button>["variant"];

/**
 * Button has no isPending of its own - the shadcn way is to compose it with Spinner and
 * disabled, which is what this does once for every form in the admin.
 */
export function SubmitButton({ children, className = "", variant = "default" }: {
  children: React.ReactNode;
  className?: string;
  variant?: Variant;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} aria-busy={pending} className={className}>
      {pending && <Spinner data-icon="inline-start" />}
      {pending ? "Working…" : children}
    </Button>
  );
}
