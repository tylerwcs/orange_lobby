import { CalendarClock, FileText, Stamp, type LucideIcon } from "lucide-react";
import type { ActivityKind } from "@/lib/types";

/**
 * Every activity kind, in the order the New activity menu offers them and the portal lists
 * them within a section (D415, D416). A kind added to `ActivityKind` must be added here: the
 * check below stops the build until it is.
 */
export const ACTIVITY_KINDS = ["booking", "submission", "passport"] as const satisfies readonly ActivityKind[];

type Covers = [ActivityKind] extends [(typeof ACTIVITY_KINDS)[number]] ? true : never;
const covers: Covers = true;
void covers;

export type KindMeta = {
  /** What the kind is called on the list row, the portal's tag and the New activity menu. */
  label: string;
  icon: LucideIcon;
  /** The New activity menu's one line on what it is for. */
  what: string;
  /** The add dialog's title and hint. */
  title: string;
  hint: string;
};

/** The one place a kind's name, icon and menu copy live (D415). */
export const KIND_META: Record<ActivityKind, KindMeta> = {
  booking: { label: "Sessions", icon: CalendarClock, what: "Attendees book a seat at a time", title: "Add a booking activity", hint: "Add its sessions once it exists." },
  submission: { label: "Submission", icon: FileText, what: "Attendees send you answers", title: "Add a submission activity", hint: "Add its questions now, or come back and edit them later." },
  passport: { label: "Passport", icon: Stamp, what: "Booths stamp a card", title: "Add a booth passport", hint: "Add its booths once it exists. Each booth gets a scanner link to print." },
};
