import { Badge } from "@/components/ui/badge";
import { changeSummary, type PlanChange } from "../sections/changes";

const HOW: Record<PlanChange["how"], { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  added: { label: "Added", variant: "success" },
  changed: { label: "Changed", variant: "warning" },
  removed: { label: "Removed", variant: "destructive" },
  kept: { label: "Kept", variant: "secondary" },
};

/** What Apply would do, one line per day or session, under a one-line summary (D449). */
export function PlanChanges({ changes, empty }: { changes: PlanChange[]; empty: string }) {
  if (changes.length === 0) return <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">{empty}</p>;
  return (
    <>
      <p className="border-t border-border px-4 py-3 text-sm font-bold">{changeSummary(changes) || "Nothing to write. See the notes below."}</p>
      <ul className="divide-y divide-border border-t border-border">
        {changes.map((c, i) => (
          <li key={i} className="flex flex-col gap-1 px-4 py-3">
            <span className="flex flex-wrap items-center gap-2 text-sm font-bold">
              <Badge variant={HOW[c.how].variant}>{HOW[c.how].label}</Badge>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.what}</span>
              {c.label}
            </span>
            {c.lines.map((line) => <span key={line} className="text-sm text-muted-foreground">{line}</span>)}
          </li>
        ))}
      </ul>
    </>
  );
}
