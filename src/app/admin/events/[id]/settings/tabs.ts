import type { SettingsPartKey } from "@/features/catalogue/client";

/**
 * D778: Settings tabs grouped by feature, in the order they show. The keys are new, so a tab
 * remembered under an old one (details, me, alerts, features, checkpoints) is simply not in the
 * list and the page opens on Event.
 */
export type SettingsTab = "whats-on" | "event" | "look" | "registration" | "checkin" | "committee" | "verification" | "address" | "danger";

const ORDER: readonly SettingsTab[] = ["whats-on", "event", "look", "registration", "checkin", "committee", "verification", "address", "danger"];

export const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  "whats-on": "What's on",
  event: "Event",
  look: "Portal look",
  registration: "Registration",
  checkin: "Check-in",
  committee: "Committee",
  verification: "Verification",
  address: "Address",
  danger: "Danger zone",
};

/**
 * D553/D565: the tabs only Ecopia admins see. Their actions refuse anyone else too, so hiding
 * them is about not showing a committee member controls that are not theirs.
 */
const ADMIN_ONLY: readonly SettingsTab[] = ["whats-on", "committee", "verification", "address", "danger"];

/**
 * The tabs this viewer gets. Address goes with the custom-domain add-on (`hidden`), and
 * Verification (D502) only shows when the event can run submissions.
 */
export function settingsTabs(o: { admin: boolean; hidden: readonly SettingsPartKey[]; verifying: boolean }): SettingsTab[] {
  return ORDER.filter((t) => (o.admin || !ADMIN_ONLY.includes(t))
    && (t !== "address" || !o.hidden.includes("address"))
    && (t !== "verification" || o.verifying));
}
