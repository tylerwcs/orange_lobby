import { notFound } from "next/navigation";
import { isValidToken } from "@/lib/tokens";
import { brandStyle } from "@/lib/brand";
import { getEventBySetupToken, getSetupRow, listSetupFiles, listSetupItems, liveAgenda } from "../db";
import { isBuiltStep, type SetupSection } from "../sections";
import { basicsFromEvent, sanitizeBasics } from "../sections/basics";
import { agendaFromLive, agendaRange, sanitizeAgenda } from "../sections/agenda";
import { toHubFile } from "../hub";
import { hasUnsubmittedChanges, sectionStatus } from "../status";
import { BasicsStep } from "./BasicsStep";
import { AgendaStep } from "./AgendaStep";

export async function SetupStepPage({ params }: { params: Promise<{ token: string; section: string }> }) {
  const { token, section } = await params;
  if (!isValidToken(token) || !isBuiltStep(section)) notFound();
  const ev = await getEventBySetupToken(token);
  if (!ev) notFound();
  const s: SetupSection = section;
  const row = await getSetupRow(ev.id, s);
  const common = { token, initialRev: row?.rev ?? 0, initialStatus: sectionStatus(row), initialUnsubmitted: hasUnsubmittedChanges(row) };

  let step: React.ReactNode;
  switch (s) {
    case "basics":
      // First visit starts from the live event, so the organiser sees and corrects what's there.
      step = <BasicsStep {...common} initial={row ? sanitizeBasics(row.answers) : basicsFromEvent(ev)} />;
      break;
    case "agenda": {
      const [basicsRow, live, items, files] = await Promise.all([
        getSetupRow(ev.id, "basics"), row ? null : liveAgenda(ev.id), listSetupItems(ev.id), listSetupFiles(ev.id),
      ]);
      const basics = basicsRow ? sanitizeBasics(basicsRow.answers) : null;
      const initial = row ? sanitizeAgenda(row.answers) : agendaFromLive(live!.days, live!.items).answers;
      step = (
        <AgendaStep {...common} initial={initial} range={agendaRange(basics, ev)} primaryColor={basics?.primary_color || ev.primary_color}
          files={files.filter((f) => f.item_key === "agenda").map(toHubFile)} notes={items.find((i) => i.item_key === "agenda")?.notes ?? ""} />
      );
      break;
    }
    default: { const never: never = s; return never; }
  }
  return (
    <main className="mx-auto w-full max-w-6xl p-4 md:p-8" style={brandStyle(ev.primary_color) as React.CSSProperties}>
      {step}
    </main>
  );
}
