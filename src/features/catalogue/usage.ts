import type { Activity, Event } from "@/lib/types";

/** What an option's `inUse` check reads: the event and its activities (D777). */
export type EventUsage = { ev: Event; activities: readonly Activity[] };
