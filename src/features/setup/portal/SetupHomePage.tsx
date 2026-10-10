import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidToken } from "@/lib/tokens";
import { brandStyle } from "@/lib/brand";
import { formatDateRange } from "@/lib/text";
import { Badge } from "@/components/ui/badge";
import { Mark } from "@/components/portal/PortalHeader";
import { eventChecklist, getEventBySetupToken, listSetupFiles, listSetupItems, listSetupRows } from "../db";
import { hasUnsubmittedChanges, sectionStatus, STATUS_LABELS, type SectionStatus } from "../status";
import { ITEM_STATUS_ORGANISER, itemStatus, toHubFile, type ItemStatus } from "../hub";
import { basicsFromEvent, sanitizeBasics } from "../sections/basics";
import { HomePreview } from "../preview/HomePreview";
import { SetupItemPanel } from "./SetupItemPanel";

const STATUS_VARIANT: Record<SectionStatus, "secondary" | "warning" | "success"> = {
  not_started: "secondary", draft: "secondary", submitted: "warning", applied: "success",
};
const ITEM_VARIANT: Record<ItemStatus, "secondary" | "outline" | "success"> = { empty: "secondary", new: "outline", handled: "success" };

/**
 * The organiser's one place (D444, D458): everything the event needs. Steps open a form; every
 * other item takes files and a note right here. A small preview shows the portal as submitted so far.
 */
export async function SetupHomePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isValidToken(token)) notFound();
  const ev = await getEventBySetupToken(token);
  if (!ev) notFound();
  const [rows, list, items, files] = await Promise.all([listSetupRows(ev.id), eventChecklist(ev), listSetupItems(ev.id), listSetupFiles(ev.id)]);
  const rowOf = (key: string) => rows.find((r) => r.section === key) ?? null;
  const itemOf = (key: string) => items.find((i) => i.item_key === key) ?? null;
  const filesOf = (key: string) => files.filter((f) => f.item_key === key);
  const hub = (key: string) => itemStatus(itemOf(key), filesOf(key).length);
  const sent = list.filter((e) => hub(e.key) !== "empty" || (e.kind === "step" && ["submitted", "applied"].includes(sectionStatus(rowOf(e.key))))).length;
  const basicsRow = rowOf("basics");
  const shown = basicsRow ? sanitizeBasics(basicsRow.submitted ?? basicsRow.answers) : basicsFromEvent(ev);

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_260px]" style={brandStyle(ev.primary_color) as React.CSSProperties}>
      <div className="flex flex-col gap-6">
        <header className="flex items-center gap-3">
          <Mark event={ev} />
          <div>
            <h1 className="text-xl font-extrabold">{ev.name}</h1>
            <p className="text-sm text-muted-foreground">Event setup · {[formatDateRange(ev.starts_on, ev.ends_on), ev.venue_name].filter(Boolean).join(" · ")}</p>
          </div>
        </header>
        <p className="text-sm">Everything we need from you for this event, in one place. Fill in the first steps here, and send the rest as files or a note on each item. Nothing goes to attendees until we&apos;ve reviewed it.</p>
        <p className="text-sm font-bold">{sent} of {list.length} item{list.length === 1 ? "" : "s"} sent</p>

        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {list.map((e) => {
            if (e.kind === "step") {
              const row = rowOf(e.key);
              const s = sectionStatus(row);
              return (
                <li key={e.key}>
                  <Link href={`/setup/${token}/${e.key}`} className="flex items-center gap-3 p-4 hover:bg-muted/50">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-bold">{e.title}</span>
                      <span className="text-xs text-muted-foreground">{e.send.join(" · ")}</span>
                    </span>
                    {filesOf(e.key).length > 0 && <span className="text-xs font-semibold text-muted-foreground">Files sent</span>}
                    {s === "applied" && hasUnsubmittedChanges(row) && <span className="text-xs font-semibold text-amber-700">Changes not submitted</span>}
                    <Badge variant={STATUS_VARIANT[s]}>{STATUS_LABELS[s]}</Badge>
                  </Link>
                </li>
              );
            }
            const status = hub(e.key);
            return (
              <li key={e.key}>
                <details className="group p-4">
                  <summary className="flex cursor-pointer list-none items-center gap-3">
                    <span className="min-w-0 flex-1 font-bold">{e.title}</span>
                    <Badge variant={ITEM_VARIANT[status]}>{ITEM_STATUS_ORGANISER[status]}</Badge>
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <ul className="list-disc pl-5 text-sm">
                      {e.send.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                    <SetupItemPanel token={token} itemKey={e.key} initialFiles={filesOf(e.key).map(toHubFile)} initialNotes={itemOf(e.key)?.notes ?? ""} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </div>
      <aside className="hidden lg:block">
        <div className="sticky top-6 flex flex-col gap-2">
          <p className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">So far</p>
          <HomePreview basics={shown} compact />
        </div>
      </aside>
    </main>
  );
}
