import type { Attendee } from "@/lib/types";
import type { LogLabels } from "@/features/attendee-log/types";

export function person(over: Partial<Attendee> & { id: string }): Attendee {
  return {
    org_id: "o1", event_id: "e1", token: "t", name: "Lee Mei Ling", email: "mei@example.com", category: null,
    group_id: null, extra: {}, source: "import", status: "active",
    consented_at: null, consent_notice: null, terms_agreed_at: null,
    ...over,
  } as Attendee;
}

export const labels: LogLabels = {
  fields: [
    { key: "shirt", label: "Shirt size", type: "text" },
    { key: "table", label: "Table", type: "text" },
  ],
  groupName: new Map([["g1", "Team A"]]),
  roomsOf: new Map(),
};
