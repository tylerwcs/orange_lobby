import { SubmitButton } from "@/components/admin/SubmitButton";
import { klDay } from "../lib/rules";

/** D595/D596: the waiting request (with Withdraw) or the decline note. Renders nothing otherwise. */
export function CancelRequestNote({ requestedAt, declinedAt, withdraw, variant }: {
  requestedAt: string | null | undefined;
  declinedAt: string | null | undefined;
  withdraw: () => Promise<void>;
  variant: "me" | "draft";
}) {
  if (requestedAt) {
    return (
      <div className={variant === "me" ? "rounded-xl border bg-card p-4 text-center text-sm" : "text-center text-sm"}>
        <p className="text-muted-foreground">You asked to cancel on {klDay(requestedAt)}. The organiser will confirm.</p>
        <form action={withdraw} className="mt-3"><SubmitButton variant="outline" className="h-11">Withdraw request</SubmitButton></form>
      </div>
    );
  }
  if (declinedAt) return <p className="text-center text-sm text-muted-foreground">The organiser declined your cancellation request.</p>;
  return null;
}
