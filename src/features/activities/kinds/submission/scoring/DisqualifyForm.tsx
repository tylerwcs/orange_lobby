"use client";
import { useRef } from "react";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

/**
 * D380: one person's Disqualify. It is a client component for two guards ConfirmButton cannot
 * give on its own. Its trigger is type="button", so Enter in the reason box would submit the
 * form straight through and skip the confirmation that says what the team loses; Enter is
 * blocked here. And an empty reason is caught before the dialog opens, not after it is
 * confirmed, by checking the form on the capture phase of the click.
 */
export function DisqualifyForm({ action, teamId, week, name, teamName, weekVoid }: {
  action: (fd: FormData) => Promise<void>;
  teamId: string;
  /** The grid's week, which a week void (D467) voids. */
  week: number;
  name: string;
  teamName: string;
  /** D467: the challenge voids one week, not the season. */
  weekVoid: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="flex gap-1.5">
      <input type="hidden" name="team" value={teamId} />
      <input type="hidden" name="week" value={week} />
      <input
        name="reason" required placeholder="Reason" aria-label={`Reason to disqualify ${name}`}
        onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        className="h-8 w-32 rounded-md border border-input bg-transparent px-2 text-xs"
      />
      <span
        onClickCapture={(e) => {
          if (form.current && !form.current.reportValidity()) { e.stopPropagation(); e.preventDefault(); }
        }}
      >
        <ConfirmButton
          message={weekVoid
            ? `Disqualify ${name}? ${teamName} scores 0 for Week ${week}, and ${name} counts nothing from then on.`
            : `Disqualify ${name}? ${teamName} will show Void on every leaderboard.`}
          confirmLabel="Disqualify"
          triggerVariant="destructive"
          className="h-8 px-2.5 text-xs"
        >
          Disqualify
        </ConfirmButton>
      </span>
    </form>
  );
}
