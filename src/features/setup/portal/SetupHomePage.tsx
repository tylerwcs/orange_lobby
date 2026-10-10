import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidToken } from "@/lib/tokens";
import { brandStyle } from "@/lib/brand";
import { formatDateRange } from "@/lib/text";
import { Badge } from "@/components/ui/badge";
import { Mark } from "@/components/portal/PortalHeader";
import { eventFeatures } from "@/features/catalogue";
import { getEventBySetupToken, listSetupRows } from "../db";
import { BUILT_STEPS } from "../sections";
import { buildChecklist } from "../checklist";
import { sectionStatus, STATUS_LABELS, type SectionStatus } from "../status";
import { basicsFromEvent, sanitizeBasics } from "../sections/basics";
import { HomePreview } from "../preview/HomePreview";

const STATUS_VARIANT: Record<SectionStatus, "secondary" | "warning" | "success"> = {
  not_started: "secondary", draft: "secondary", submitted: "warning", applied: "success",
};

/**
 * The organiser's one place (D444): everything the event needs. Steps open
 * a form; cards say what to send. A small preview shows the portal as submitted so far.
 */
export async function SetupHomePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isValidToken(token)) notFound();
  const ev = await getEventBySetupToken(token);
  if (!ev) notFound();
  const [rows, features] = await Promise.all([listSetupRows(ev.id), eventFeatures(ev.id)]);
  const list = buildChecklist({
    features, custom: features.custom,
    selfRegistration: ev.registration_open || ev.registration_questions.length > 0, builtSteps: BUILT_STEPS,
  });
  const rowOf = (key: string) => rows.find((r) => r.section === key) ?? null;
  const steps = list.filter((e) => e.kind === "step");
  const done = steps.filter((e) => ["submitted", "applied"].includes(sectionStatus(rowOf(e.key)))).length;
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
        <p className="text-sm">Everything we need from you for this event. Fill in each section here, or send the items listed to your project contact. Nothing goes to attendees until we&apos;ve reviewed it.</p>
        <p className="text-sm font-bold">{done} of {steps.length} section{steps.length === 1 ? "" : "s"} submitted</p>

        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {list.map((e) => {
            if (e.kind === "step") {
              const s = sectionStatus(rowOf(e.key));
              return (
                <li key={e.key}>
                  <Link href={`/setup/${token}/${e.key}`} className="flex items-center gap-3 p-4 hover:bg-muted/50">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-bold">{e.title}</span>
                      <span className="text-xs text-muted-foreground">{e.send.join(" · ")}</span>
                    </span>
                    <Badge variant={STATUS_VARIANT[s]}>{STATUS_LABELS[s]}</Badge>
                  </Link>
                </li>
              );
            }
            return (
              <li key={e.key}>
                <details className="group p-4">
                  <summary className="flex cursor-pointer list-none items-center gap-3">
                    <span className="min-w-0 flex-1 font-bold">{e.title}</span>
                    <span className="text-xs font-bold text-primary group-open:hidden">What to send</span>
                  </summary>
                  <ul className="mt-3 list-disc pl-5 text-sm">
                    {e.send.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">Send these to your project contact.</p>
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
