import type { AgendaDay, AgendaItem } from "@/lib/types";
import { agendaRows } from "@/lib/breakouts";
import { placeKey, rowKey, sortOrdersFor } from "@/lib/agenda-placement";
import { shortDate } from "@/lib/text";
import { blankAgenda, sanitizeAgenda, type AgendaAnswers, type AgendaMap, type SetupDay, type SetupSession } from "./agenda";
import { RESTORED, type PlanChange } from "./changes";

/** The event's agenda now. */
export type AgendaLive = { days: AgendaDay[]; items: AgendaItem[] };

export type DayInsert = { id: string; date: string; name: string | null };
export type DayUpdate = { id: string; date?: string; name?: string | null };
/** The fields the Agenda step owns (D453). Who it's for, photos, rounds and colours are the admin's. */
export type ItemValues = { day_id: string; starts_at: string; ends_at: string | null; title: string; description: string | null; location: string | null };
export type ItemInsert = ItemValues & { id: string; sort_order: number };
export type ItemUpdate = { id: string } & Partial<ItemValues>;

/** Everything one Apply writes (D455), what the review lists, and why it would refuse. */
export type AgendaPlan = {
  days: { insert: DayInsert[]; update: DayUpdate[]; delete: string[] };
  items: { insert: ItemInsert[]; update: ItemUpdate[]; delete: string[] };
  order: { id: string; sort_order: number }[];
  /** The whole new applied_map. */
  map: AgendaMap;
  changes: PlanChange[];
  problems: string[];
};

type Shared = Omit<ItemValues, "day_id">;
type Key = keyof Shared | "day_id";

const LABELS: Record<Key, string> = { starts_at: "Start", ends_at: "End", title: "Title", description: "Description", location: "Location", day_id: "Day" };

const nul = (s: string) => s.trim() || null;
/** "" reads as null, so a blank from admin and a blank in the answers are the same. */
const norm = (v: string | null | undefined) => (v === "" || v === undefined ? null : v);
const same = (a: string | null | undefined, b: string | null | undefined) => norm(a) === norm(b);
const show = (v: string | null | undefined) => norm(v) ?? "empty";
const dayText = (d: Pick<SetupDay, "date" | "name">) => d.name.trim() || (d.date.trim() ? shortDate(d.date.trim()) : "A day");

/** A session's answer as Apply writes it: trimmed, blanks as null. */
function written(s: SetupSession): Shared {
  return { starts_at: s.starts_at.trim(), ends_at: nul(s.ends_at), title: s.title.trim(), description: nul(s.description), location: nul(s.location) };
}

function writtenLive(i: AgendaItem): Shared {
  return { starts_at: i.starts_at ?? "", ends_at: i.ends_at, title: i.title, description: i.description, location: i.location };
}

/** The fields the organiser changed since the baseline. A move between days compares setup day ids. */
function changedKeys(s: SetupSession, b: SetupSession): Key[] {
  const w = written(s);
  const wb = written(b);
  const keys: Key[] = (Object.keys(w) as (keyof Shared)[]).filter((k) => !same(w[k], wb[k]));
  return s.day !== b.day ? [...keys, "day_id"] : keys;
}

/** The organiser's baseline for Apply (D450): the last applied version, else their starting point, else nothing. */
export function agendaBaseline(row: { applied: unknown; seed: unknown } | null): AgendaAnswers {
  if (row?.applied) return sanitizeAgenda(row.applied);
  if (row?.seed) return sanitizeAgenda(row.seed);
  return blankAgenda();
}

/**
 * What Apply writes (D450, D455, D456). Compares the submitted answers with the baseline, matches
 * them to real rows through `map`, and writes only what the organiser changed that the live
 * agenda doesn't already hold:
 * - a field the organiser left alone is never written, so an admin's edit survives;
 * - a session the admin deleted stays deleted unless the organiser changed it again;
 * - rows the admin created (rounds and image rows too) are never touched;
 * - a day the organiser removed goes only when nothing else is on it;
 * - new, retimed and moved sessions are placed by time among their day's rows (D456).
 * `newId` names new rows; Apply passes crypto.randomUUID, review a counter.
 */
export function planAgenda({ submitted: S, baseline: B, map, live, newId }: {
  submitted: AgendaAnswers;
  baseline: AgendaAnswers;
  map: AgendaMap;
  live: AgendaLive;
  newId: () => string;
}): AgendaPlan {
  const plan: AgendaPlan = {
    days: { insert: [], update: [], delete: [] }, items: { insert: [], update: [], delete: [] },
    order: [], map: {}, changes: [], problems: [],
  };
  const change = (c: PlanChange) => plan.changes.push(c);
  const liveDays = new Map(live.days.map((d) => [d.id, d]));
  const liveItems = new Map(live.items.map((i) => [i.id, i]));
  const bDays = new Map(B.days.map((d) => [d.id, d]));
  const bSessions = new Map(B.sessions.map((s) => [s.id, s]));
  const sDays = new Map(S.days.map((d) => [d.id, d]));
  const sSessionIds = new Set(S.sessions.map((s) => s.id));
  /** Sessions to place by time, per day. */
  const touched: { day: string; key: string; time: string }[] = [];

  // Days. A submitted day's own row while it exists; `claimed` rows are spoken for, so a new day
  // adopts an admin's day on its date without taking one another day uses.
  const real = new Map<string, string>();
  for (const d of S.days) {
    const r = map[d.id];
    if (r && liveDays.has(r)) real.set(d.id, r);
  }
  const claimed = new Set(real.values());

  /** The row a submitted day writes to, made on first need: its own, else an admin's day on its date, else a new one. */
  const needDay = (d: SetupDay, note?: string): string => {
    const have = real.get(d.id);
    if (have) return have;
    const date = d.date.trim();
    const adopt = live.days.find((x) => x.date === date && !claimed.has(x.id));
    if (adopt) {
      real.set(d.id, adopt.id);
      claimed.add(adopt.id);
      const name = nul(d.name);
      if (name && name !== (adopt.name?.trim() || null)) {
        plan.days.update.push({ id: adopt.id, name });
        change({ what: "day", how: "changed", label: dayText(d), lines: [`Name: ${show(adopt.name)} → ${name}`] });
      }
      return adopt.id;
    }
    const id = newId();
    real.set(d.id, id);
    claimed.add(id);
    plan.days.insert.push({ id, date, name: nul(d.name) });
    change({ what: "day", how: "added", label: dayText(d), lines: note ? [note] : [] });
    return id;
  };

  for (const d of S.days) {
    const b = bDays.get(d.id);
    if (!b || !map[d.id]) { needDay(d); continue; }
    const ld = liveDays.get(real.get(d.id) ?? "");
    const dateChanged = d.date.trim() !== b.date.trim();
    const nameChanged = nul(d.name) !== nul(b.name);
    if (!ld) {
      if (dateChanged || nameChanged) needDay(d, RESTORED);
      continue;
    }
    const patch: DayUpdate = { id: ld.id };
    const lines: string[] = [];
    if (dateChanged && d.date.trim() !== ld.date) {
      patch.date = d.date.trim();
      lines.push(`Date: ${shortDate(ld.date)} → ${shortDate(d.date.trim())}`);
    }
    if (nameChanged && nul(d.name) !== (ld.name?.trim() || null)) {
      patch.name = nul(d.name);
      lines.push(`Name: ${show(ld.name)} → ${show(nul(d.name))}`);
    }
    if (lines.length) {
      plan.days.update.push(patch);
      change({ what: "day", how: "changed", label: dayText(d), lines });
    }
  }

  const dayOf = (s: SetupSession) => sDays.get(s.day)!;
  const timeText = (w: Shared) => (w.ends_at ? `${w.starts_at}–${w.ends_at}` : w.starts_at);

  const insertSession = (s: SetupSession, note?: string) => {
    const d = dayOf(s);
    const dayId = needDay(d);
    const w = written(s);
    const id = newId();
    plan.items.insert.push({ id, day_id: dayId, ...w, sort_order: 0 });
    plan.map[s.id] = id;
    touched.push({ day: dayId, key: id, time: w.starts_at });
    change({ what: "session", how: "added", label: w.title, lines: [`${dayText(d)}, ${timeText(w)}`, ...(note ? [note] : [])] });
  };

  const updateSession = (s: SetupSession, b: SetupSession) => {
    const r = map[s.id];
    const li = liveItems.get(r);
    const keys = changedKeys(s, b);
    if (!li) {
      if (keys.length) insertSession(s, RESTORED);
      else plan.map[s.id] = r;
      return;
    }
    plan.map[s.id] = r;
    const d = dayOf(s);
    const w = written(s);
    const lw = writtenLive(li);
    const patch: ItemUpdate = { id: li.id };
    const lines: string[] = [];
    for (const k of keys) {
      if (k === "day_id") {
        const to = needDay(d);
        if (to !== li.day_id) { patch.day_id = to; lines.push(`Day: ${shortDate(li.day)} → ${dayText(d)}`); }
        continue;
      }
      if (!same(w[k], lw[k])) {
        (patch as Record<string, unknown>)[k] = w[k];
        lines.push(`${LABELS[k]}: ${show(lw[k])} → ${show(w[k])}`);
      }
    }
    if (!lines.length) return;
    plan.items.update.push(patch);
    change({ what: "session", how: "changed", label: w.title, lines });
    if (patch.day_id || patch.starts_at) touched.push({ day: patch.day_id ?? li.day_id!, key: li.id, time: patch.starts_at ?? li.starts_at ?? w.starts_at });
  };

  for (const s of S.sessions) {
    const b = bSessions.get(s.id);
    if (!b || !map[s.id]) insertSession(s);
    else updateSession(s, b);
  }
  for (const b of B.sessions) {
    if (sSessionIds.has(b.id)) continue;
    const li = map[b.id] ? liveItems.get(map[b.id]) : undefined;
    if (!li) continue;
    plan.items.delete.push(li.id);
    change({ what: "session", how: "removed", label: li.title, lines: [] });
  }

  // Days the organiser removed: gone only when nothing else is on them.
  const leaving = new Set(plan.items.delete);
  for (const u of plan.items.update) if (u.day_id) leaving.add(u.id);
  for (const b of B.days) {
    if (sDays.has(b.id)) continue;
    const ld = map[b.id] ? liveDays.get(map[b.id]) : undefined;
    if (!ld || claimed.has(ld.id)) continue;
    const label = dayText({ date: ld.date, name: ld.name ?? "" });
    const others = live.items.filter((i) => i.day_id === ld.id && !leaving.has(i.id));
    if (others.length) {
      change({ what: "day", how: "kept", label, lines: [`Not removed: ${others.length} item${others.length === 1 ? " was" : "s were"} added in admin.`] });
    } else {
      plan.days.delete.push(ld.id);
      change({ what: "day", how: "removed", label, lines: [] });
    }
  }
  for (const d of S.days) {
    const r = real.get(d.id) ?? map[d.id];
    if (r) plan.map[d.id] = r;
  }

  // The portal finds a day by its date, so two can't share one.
  const deletedDays = new Set(plan.days.delete);
  const newDate = new Map(plan.days.update.filter((u) => u.date).map((u) => [u.id, u.date!]));
  const dates = [
    ...live.days.filter((d) => !deletedDays.has(d.id)).map((d) => newDate.get(d.id) ?? d.date),
    ...plan.days.insert.map((d) => d.date),
  ];
  for (const date of new Set(dates.filter((x, i) => dates.indexOf(x) !== i))) {
    plan.problems.push(`Two days would fall on ${shortDate(date)}. Change one of them in admin first.`);
  }

  // Order (D456): each touched session lifted out, then placed by time in turn; everything else
  // (rounds and image rows too) keeps its hand order.
  const deleted = new Set(plan.items.delete);
  const updates = new Map(plan.items.update.map((u) => [u.id, u]));
  const final: AgendaItem[] = [
    ...live.items.filter((i) => !deleted.has(i.id)).map((i) => ({ ...i, ...updates.get(i.id) }) as AgendaItem),
    ...plan.items.insert.map((n): AgendaItem => ({
      ...n, event_id: "", kind: "session", day: n.day_id, categories: null, slot: null, code: null, color: null, image_url: null,
    })),
  ];
  const orders = new Map<string, number>();
  for (const dayId of new Set(touched.map((t) => t.day))) {
    const rows = agendaRows(final.filter((i) => i.day_id === dayId).map((i) => ({ ...i, day: dayId })));
    const byKey = new Map(rows.map((r) => [rowKey(r), r]));
    const moving = touched.filter((t) => t.day === dayId && byKey.has(t.key)).sort((x, y) => x.time.localeCompare(y.time));
    const lifted = new Set(moving.map((t) => t.key));
    let keys = rows.map(rowKey).filter((k) => !lifted.has(k));
    for (const t of moving) keys = placeKey(keys.map((k) => byKey.get(k)!), t.key, t.time);
    for (const [id, n] of sortOrdersFor(rows, keys)) orders.set(id, n);
  }
  for (const n of plan.items.insert) n.sort_order = orders.get(n.id) ?? n.sort_order;
  plan.order = [...orders]
    .filter(([id, n]) => liveItems.has(id) && liveItems.get(id)!.sort_order !== n)
    .map(([id, sort_order]) => ({ id, sort_order }));
  return plan;
}
