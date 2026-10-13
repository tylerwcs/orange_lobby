"use client";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { OTHER, REASON_MAX } from "../../lib/revoke";

/**
 * D498: the reason picker every revoke goes through - the admin's Submissions table and the
 * verifier's page alike. The event's templates as radios, then "Other", whose box appears
 * only once it is picked. `required` on the radios stops an empty post in the browser;
 * `parseRevokeReason` is what actually decides.
 */
export function RevokeForm({ action, reasons }: { action: (fd: FormData) => Promise<void>; reasons: string[] }) {
  const [picked, setPicked] = useState("");
  return (
    <form action={action} className="flex flex-col gap-4 p-1">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold">Reason</legend>
        {[...reasons, OTHER].map((r) => (
          <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input type="radio" name="reason" value={r} required checked={picked === r} onChange={() => setPicked(r)} className="size-4 shrink-0 accent-primary" />
            {r === OTHER ? "Other (type a reason)" : r}
          </label>
        ))}
      </fieldset>
      {picked === OTHER && (
        <Textarea name="other" required maxLength={REASON_MAX} rows={3} autoFocus aria-label="Your reason" placeholder="What should they fix?" />
      )}
      <SubmitButton variant="destructive">Revoke</SubmitButton>
    </form>
  );
}
