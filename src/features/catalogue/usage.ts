import type { Activity, Event } from "@/lib/types";
import { FEATURES } from "./catalogue";

/** What an option's `inUse` check reads: the event and its activities (D777). */
export type EventUsage = { ev: Event; activities: readonly Activity[] };

/** The keys of the options this event is using. An option with no `inUse` check is never listed (D779). */
export function optionsInUse(u: EventUsage): Set<string> {
  const used = new Set<string>();
  for (const f of Object.values(FEATURES)) for (const o of f.options) if (o.inUse?.(u)) used.add(o.key);
  return used;
}
