import { PendingLink } from "@/components/PendingNav";

/**
 * D810: the Leaderboard tab's week picker - "All weeks", then each week that has begun, the
 * running one marked "(live)", as the committee's chips (D381). Links, not state, so Back works
 * and the server draws the week; must sit inside a PendingScope, whose swap holds the standings.
 */
export function WeekChips({ weeks, week, href }: {
  weeks: { number: number; live: boolean }[];
  /** The week on show; null is All weeks. */
  week: number | null;
  href: (week: number | "all") => string;
}) {
  const chip = "flex min-h-9 items-center rounded-full border px-3.5 text-xs";
  const chips = [{ key: "all" as const, label: "All weeks" }, ...weeks.map((w) => ({ key: w.number, label: `Week ${w.number}${w.live ? " (live)" : ""}` }))];
  return (
    <nav aria-label="Week" className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <PendingLink key={c.key} href={href(c.key)} selected={c.key === (week ?? "all")} className={chip}
          selectedClassName="border-primary bg-primary/10 font-extrabold text-primary"
          unselectedClassName="border-border font-semibold text-muted-foreground">
          {c.label}
        </PendingLink>
      ))}
    </nav>
  );
}
