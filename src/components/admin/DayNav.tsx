import Form from "next/form";
import Link from "next/link";
import { SubmitButton } from "@/components/admin/SubmitButton";

const link = "text-sm font-bold text-primary underline-offset-4 hover:underline";

/**
 * Which day a per-day list is showing. Lifted out of `MissingPanel` so the Submissions tab of a
 * scored challenge (D383) steps through days the same way the Not submitted tab does.
 *
 * The day form is a GET so the chosen day lives in the URL: a desk working through the
 * morning can bookmark it, reload it, or send it to a colleague and get the same list. It is
 * `next/form` rather than a bare <form> so Show navigates in place - the page's keyed
 * Suspense puts up a skeleton - instead of reloading the whole admin.
 */
export function DayNav({ day, today, basePath, tab, prev, next }: {
  day: string;
  today: string;
  basePath: string;
  /**
   * The page tab this sits on. A GET form replaces the whole query string, so without it
   * choosing a day would land back on the default tab (D234).
   */
  tab?: string;
  /** D383: the days either side, for one-tap stepping; `next` is null on today. */
  prev?: string;
  next?: string | null;
}) {
  const hrefFor = (d: string) => {
    const qs = new URLSearchParams();
    if (tab) qs.set("tab", tab);
    if (d !== today) qs.set("day", d);
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <Form action={basePath} className="flex flex-wrap items-end gap-2">
      {tab && <input type="hidden" name="tab" value={tab} />}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">Day</span>
        {/* Keyed by the day, so stepping with a link (not the form) shows the new day here too. */}
        <input
          key={day} type="date" name="day" defaultValue={day}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      <SubmitButton variant="outline">Show</SubmitButton>
      {prev && <Link href={hrefFor(prev)} className={link}>Previous day</Link>}
      {next && <Link href={hrefFor(next)} className={link}>Next day</Link>}
      {day !== today && <Link href={hrefFor(today)} className={link}>Back to today</Link>}
    </Form>
  );
}
