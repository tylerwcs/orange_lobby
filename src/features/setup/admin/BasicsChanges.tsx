import type { BasicsChange } from "../sections/basics";

/** Basics' changes, field by field: text before and after, images side by side (D449). */
export function BasicsChanges({ changes, applied }: { changes: BasicsChange[]; applied: boolean }) {
  if (changes.length === 0) {
    return <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">{applied ? "Nothing new since the last Apply." : "Matches the live event."}</p>;
  }
  return (
    <ul className="divide-y divide-border border-t border-border">
      {changes.map((c) => (
        <li key={c.field} className="flex flex-col gap-1 px-4 py-3">
          <span className="text-sm font-bold">{c.label}{c.infoOnly && <span className="ml-2 text-xs font-normal text-muted-foreground">For your notes, not written to the event</span>}</span>
          {c.image ? (
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.before ? <img src={c.before} alt="Current" className="h-14 rounded border border-border object-contain" /> : <span>None</span>}
              →
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.after ? <img src={c.after} alt="Submitted" className="h-14 rounded border border-border object-contain" /> : <span>Removed</span>}
            </span>
          ) : (
            <span className="whitespace-pre-line text-sm">
              {!c.infoOnly && <span className="text-muted-foreground line-through">{c.before || "empty"}</span>}
              {!c.infoOnly && " → "}
              {c.after || <span className="text-muted-foreground">empty</span>}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
