import "server-only";
import { eventFields } from "@/lib/attendee-fields";
import { breakoutSlots } from "@/lib/breakouts";
import { listAgenda } from "@/lib/db/agenda";
import { listAssignments } from "@/lib/db/breakouts";
import { listGroups } from "@/lib/db/groups";
import type { Event } from "@/lib/types";
import type { LogLabels } from "./types";

/**
 * What turns an attendee row into labelled values (D742): the fields as they are now, group
 * names, and each person's room per breakout round, keyed by the round's name. Load once per
 * request, before the change is made if the "before" values are needed.
 */
export async function loadLabels(ev: Pick<Event, "id" | "registration_questions" | "attendee_fields">): Promise<LogLabels> {
  const [groups, agenda] = await Promise.all([listGroups(ev.id), listAgenda(ev.id)]);
  const roomsOf = new Map<string, Record<string, string>>();
  // Only an event that runs breakouts pays for the assignments query.
  if (breakoutSlots(agenda).length > 0) {
    const codeOf = new Map(agenda.filter((i) => i.code).map((i) => [i.id, i.code as string]));
    for (const a of await listAssignments(ev.id)) {
      const code = codeOf.get(a.agenda_item_id);
      if (!code) continue;
      const row = roomsOf.get(a.attendee_id) ?? {};
      row[a.slot] = code;
      roomsOf.set(a.attendee_id, row);
    }
  }
  return {
    fields: eventFields(ev.registration_questions, ev.attendee_fields),
    groupName: new Map(groups.map((g) => [g.id, g.name])),
    roomsOf,
  };
}
