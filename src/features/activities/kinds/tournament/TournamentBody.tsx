import { RichSections } from "@/components/portal/RichSections";
import type { TournamentEntry } from "../../lib/portal-activity-entries";

/** A tournament in the portal (D644, D645). The squads page itself lands in Task 6. */
export function TournamentBody({ entry: { activity } }: { entry: TournamentEntry; slug: string; token: string }) {
  return <RichSections html={activity.description} />;
}
