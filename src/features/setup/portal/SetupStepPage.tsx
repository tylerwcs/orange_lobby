import { notFound } from "next/navigation";
import { isValidToken } from "@/lib/tokens";
import { brandStyle } from "@/lib/brand";
import { getEventBySetupToken, getSetupRow } from "../db";
import { isBuiltStep } from "../sections";
import { basicsFromEvent, sanitizeBasics } from "../sections/basics";
import { hasUnsubmittedChanges, sectionStatus } from "../status";
import { BasicsStep } from "./BasicsStep";

export async function SetupStepPage({ params }: { params: Promise<{ token: string; section: string }> }) {
  const { token, section } = await params;
  if (!isValidToken(token) || !isBuiltStep(section)) notFound();
  const ev = await getEventBySetupToken(token);
  if (!ev) notFound();
  const row = await getSetupRow(ev.id, section);
  // First visit starts from the live event, so the organiser sees and corrects what's there.
  const initial = row ? sanitizeBasics(row.answers) : basicsFromEvent(ev);
  return (
    <main className="mx-auto w-full max-w-6xl p-4 md:p-8" style={brandStyle(ev.primary_color) as React.CSSProperties}>
      <BasicsStep token={token} initial={initial} initialRev={row?.rev ?? 0} initialStatus={sectionStatus(row)} initialUnsubmitted={hasUnsubmittedChanges(row)} />
    </main>
  );
}
