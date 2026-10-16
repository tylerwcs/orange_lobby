import Link from "next/link";
import type { Activity, Event } from "@/lib/types";
import { listGroups } from "@/lib/db/groups";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/admin/Field";
import { Modal } from "@/components/admin/Modal";
import { RowActions } from "@/components/admin/RowActions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { squadPeople, squadRows } from "../db/tournaments";
import { loadResults, loadSportResults } from "../db/results";
import { countedRows, isLocked, squadMembers } from "../lib/squads";
import {
  bracketName, bracketPlaces, defaultPlaying, formatTime, hasResult, matchesLeft, ordinal, pickerOptions, pointsFor, poolName, poolStandings,
  resolveSport, sportPlaces, type PoolTable, type Resolved, type SportResults,
} from "../lib/results";
import { markForfeitsIfDue } from "./forfeits";
import {
  addMatchAction, clearResultAction, deleteMatchAction, drawPoolsAction, pickTeamsAction, resetSportAction, savePlacesAction, savePoolsAction,
  saveResultAction, setForfeitAction, walkoverAction,
} from "./results-actions";

const box = "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const num = `${box} w-16 text-center tabular-nums`;
const list = "flex flex-col divide-y rounded-xl border bg-card";

type Bound = { ev: Event; activity: Activity; sr: SportResults; names: Map<string, string> };

/**
 * D664: a tournament's Matches tab - one sport at a time: its pools, pool matches, playoffs and
 * places (or, by hand, its matches and the places the organiser types). Scores go straight into
 * the rows; every write is a server action that lands back here with a flash.
 */
export async function MatchesPanel({ ev, activity, sportId }: { ev: Event; activity: Activity; sportId?: string }) {
  const [results, groups] = await Promise.all([loadResults(activity.id), listGroups(ev.id)]);
  if (results.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Add a sport first, on the <Link href={`/admin/events/${ev.id}/activities/${activity.id}?tab=sports`} className="font-semibold text-primary underline-offset-4 hover:underline">Sports tab</Link>.
      </p>
    );
  }
  let sr = results.find((r) => r.sport.id === sportId) ?? results[0];
  if (await markForfeitsIfDue(activity, sr)) sr = (await loadSportResults(activity.id, sr.sport.id)) ?? sr;
  const names = new Map(groups.map((g) => [g.id, g.name]));
  const href = (id: string) => `/admin/events/${ev.id}/activities/${activity.id}?tab=matches&sport=${id}`;
  const bound: Bound = { ev, activity, sr, names };

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Sports" className="flex flex-wrap gap-1.5">
        {results.map((r) => {
          const left = matchesLeft(resolveSport(r, names));
          const suffix = r.matches.length === 0 ? "" : left > 0 ? ` · ${left} left` : " · done";
          return (
            <Link key={r.sport.id} href={href(r.sport.id)} aria-current={r.sport.id === sr.sport.id ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${r.sport.id === sr.sport.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
              {r.sport.name}<span className="font-normal">{suffix}</span>
            </Link>
          );
        })}
      </nav>
      {groups.length === 0
        ? <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No groups yet. Teams are the event&apos;s groups: add them on the Groups page.</p>
        : sr.sport.format === "manual"
          ? <ManualSport {...bound} groups={groups} />
          : <PoolsSport {...bound} groups={groups} />}
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-extrabold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

async function PoolsSport({ ev, activity, sr, names, groups }: Bound & { groups: { id: string; name: string }[] }) {
  const resolved = resolveSport(sr, names);
  const tables = poolStandings(sr, resolved);
  const rows = await squadRows(activity.id);
  const counted = countedRows(rows, await squadPeople(ev.id, rows.map((r) => r.attendee_id)));
  const results = sr.matches.some((m) => hasResult(m, sr.slots));
  const sport = sr.sport;
  const sitting = groups.filter((g) => !sr.pools.some((p) => p.group_id === g.id));
  const short = sport.forfeits_marked_at || isLocked(activity.squads_close_at, new Date())
    ? []
    : sr.pools.filter((p) => !p.forfeit && squadMembers(counted, sport.id, p.group_id).length < sport.min_size).map((p) => names.get(p.group_id) ?? "");
  const poolCount = Math.max(tables.length, Math.floor(groups.length / sport.pool_size), 1);
  const reset = resetSportAction.bind(null, ev.id, activity.id, sport.id);
  const poolMatches = resolved.filter((r) => r.match.stage === "pool");
  const brackets = [...new Set(resolved.filter((r) => r.match.stage === "bracket").map((r) => r.match.bracket ?? 0))].sort((a, b) => a - b);
  const teams = tables.length;

  const draw = (
    <Modal title={`Draw ${sport.name}'s pools`} trigger={sr.pools.length ? "Draw again" : "Draw at random"} icon="users" variant={sr.pools.length ? "outline" : "default"}
      hint={`Ticked groups play ${sport.name}, in pools of ${sport.pool_size}. A group left out sits it out: it isn't a forfeit and gets no place.`}>
      <form action={drawPoolsAction.bind(null, ev.id, activity.id, sport.id)} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {groups.map((g) => (
            <label key={g.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="groups" value={g.id} defaultChecked={(sr.pools.length ? sr.pools.map((p) => p.group_id) : defaultPlaying(groups.map((x) => x.id), counted)).includes(g.id)} className="size-4" />
              {g.name}
            </label>
          ))}
        </div>
        <SubmitButton>Draw pools</SubmitButton>
      </form>
    </Modal>
  );
  const edit = (
    <Modal title={`${sport.name}'s pools`} trigger="Edit pools" hint={`Each pool needs ${sport.pool_size} groups.`}>
      <form action={savePoolsAction.bind(null, ev.id, activity.id, sport.id)} className="flex flex-col gap-2">
        {groups.map((g) => {
          const at = sr.pools.find((p) => p.group_id === g.id);
          return (
            <label key={g.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold">{g.name}</span>
              <select name={`pool:${g.id}`} defaultValue={at ? String(at.pool) : ""} className={box}>
                <option value="">Sits out</option>
                {Array.from({ length: poolCount }, (_, i) => <option key={i} value={i}>{poolName(i)}</option>)}
              </select>
            </label>
          );
        })}
        <SubmitButton>Save pools</SubmitButton>
      </form>
    </Modal>
  );

  return (
    <div className="flex flex-col gap-6">
      <Section title="Pools" aside={
        <div className="flex flex-wrap items-center gap-2">
          {!results && draw}
          {!results && edit}
          {sr.matches.length > 0 && (
            <RowActions name={`${sport.name}'s matches`}
              remove={{ action: reset, label: "Reset this sport's matches", message: `Clear every ${sport.name} result and its pools? This can't be undone.` }} />
          )}
        </div>
      }>
        {sr.pools.length === 0 ? (
          <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No pools yet. Draw them at random, or place each group with Edit pools.</p>
        ) : (
          <>
            {short.length > 0 && (
              <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
                {short.length} squad{short.length === 1 ? " is" : "s are"} short: {short.join(", ")}. They&apos;ll be marked forfeit when squads lock.
              </p>
            )}
            {results && <p className="text-sm text-muted-foreground">Pools are set. Reset this sport&apos;s matches (⋯) to draw them again.</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {tables.map((t) => (
                <div key={t.pool} className="flex flex-col gap-1 rounded-xl border bg-card p-3">
                  <p className="text-sm font-extrabold">{t.name}</p>
                  {sr.pools.filter((p) => p.pool === t.pool).map((p) => (
                    <div key={p.group_id} className="flex items-center justify-between gap-2 text-sm">
                      <span>{names.get(p.group_id)} {p.forfeit && <Badge variant="warning">Forfeit</Badge>}</span>
                      <RowActions name={names.get(p.group_id) ?? "Group"} actions={[{
                        label: p.forfeit ? "Lift forfeit" : "Mark forfeit",
                        action: setForfeitAction.bind(null, ev.id, activity.id, sport.id, p.group_id, !p.forfeit),
                      }]} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {sitting.length > 0 && <p className="text-sm text-muted-foreground">Sitting out: {sitting.map((g) => g.name).join(", ")}</p>}
          </>
        )}
      </Section>

      {poolMatches.length > 0 && (
        <Section title={sport.result_kind === "time" ? "Heats" : "Pool matches"} aside={<span className="text-sm text-muted-foreground">{poolMatches.filter((r) => r.played).length} of {poolMatches.length} played</span>}>
          <div className={list}>{poolMatches.map((r) => <MatchRow key={r.match.id} r={r} b={{ ev, activity, sr, names }} tables={tables} resolved={resolved} />)}</div>
          <Standings tables={tables} names={names} time={sport.result_kind === "time"} />
        </Section>
      )}

      {brackets.map((b) => (
        <Section key={b} title={`${bracketName(b)} · ${bracketPlaces(b, teams)}`}>
          <div className={list}>
            {resolved.filter((r) => r.match.stage === "bracket" && r.match.bracket === b).map((r) => <MatchRow key={r.match.id} r={r} b={{ ev, activity, sr, names }} tables={tables} resolved={resolved} />)}
          </div>
        </Section>
      ))}

      {sr.pools.length > 0 && <Places sr={sr} resolved={resolved} names={names} table={activity.place_points ?? null} />}
    </div>
  );
}

function Standings({ tables, names, time }: { tables: PoolTable[]; names: Map<string, string>; time: boolean }) {
  return (
    <details className="rounded-xl border bg-card p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Pool tables</summary>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tables.map((t) => (
          <table key={t.pool} className="w-full tabular-nums">
            <caption className="text-left font-bold">{t.name}</caption>
            <thead className="text-xs text-muted-foreground">
              <tr><th className="text-left font-medium">Group</th>{time ? <th className="text-right font-medium">Time</th> : ["P", "W", "D", "L", "Diff", "For"].map((h) => <th key={h} className="text-right font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {t.rows.map((r) => (
                <tr key={r.groupId}>
                  <td>{r.rank}{r.tied ? "=" : ""} {names.get(r.groupId)}{r.forfeit && " · Forfeit"}</td>
                  {time
                    ? <td className="text-right">{r.forfeit ? "—" : r.dnf ? "DNF" : r.timeMs ? formatTime(r.timeMs) : "—"}</td>
                    : [r.played, r.won, r.drawn, r.lost, r.diff > 0 ? `+${r.diff}` : r.diff, r.scored].map((v, i) => <td key={i} className="text-right">{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </details>
  );
}

/** One match or race: who plays, the score or time boxes, and its ⋯ menu (D658). */
function MatchRow({ r, b, tables, resolved }: { r: Resolved; b: Bound; tables: PoolTable[]; resolved: Resolved[] }) {
  const { ev, activity, sr, names } = b;
  const sport = sr.sport;
  const time = sport.result_kind === "time";
  const who = (e: Resolved["entries"][number]) => (e.groupId ? names.get(e.groupId) ?? "A group" : e.pointer ?? "To be picked");
  const ready = r.entries.length > 0 && r.entries.every((e) => e.groupId);
  const fixed = sr.slots.filter((s) => s.match_id === r.match.id && !s.source_match_id);
  const canPick = r.match.stage === "bracket" && fixed.length > 0;
  const result = hasResult(r.match, sr.slots);
  const save = saveResultAction.bind(null, ev.id, activity.id, sport.id, r.match.id);
  const key = sr.slots.filter((s) => s.match_id === r.match.id).map((s) => `${s.group_id}:${s.score}:${s.time_ms}:${s.dnf}`).join("|") + (r.match.went_through ?? "");
  const options = canPick ? pickerOptions(sr, resolved, tables, names, r.match.id) : [];
  const pickForm = canPick && (
    <form action={pickTeamsAction.bind(null, ev.id, activity.id, sport.id, r.match.id)} className="flex flex-col gap-3">
      {fixed.map((s) => (
        <select key={s.slot} name={`slot:${s.slot}`} aria-label={`Team ${s.slot + 1}`} defaultValue={s.group_id ?? ""} className={box}>
          <option value="">To be picked</option>
          {options.map((o) => <option key={o.id} value={o.id} disabled={!!o.usedIn}>{o.label}{o.usedIn ? ` · already in ${o.usedIn}` : ""}</option>)}
        </select>
      ))}
      <SubmitButton>Save teams</SubmitButton>
    </form>
  );

  return (
    <div className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{r.label}</p>
        {time
          ? <p className="text-sm">{r.entries.map(who).join(" · ") || "No squads yet"}</p>
          : <p className="font-semibold">{r.entries.map(who).join(" v ")}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          {r.played && <Badge variant="success">{r.note ?? "Played"}</Badge>}
          {!r.played && r.note && <Badge variant="secondary">{r.note}</Badge>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {ready && !time && !r.entries.some((e) => e.forfeit) && (
          <form key={key} action={save} className="flex flex-wrap items-center gap-2">
            <input name="score:0" aria-label={`${who(r.entries[0])} score`} inputMode="numeric" pattern="\d{1,3}" defaultValue={r.entries[0].score ?? ""} className={num} />
            <span aria-hidden>–</span>
            <input name="score:1" aria-label={`${who(r.entries[1])} score`} inputMode="numeric" pattern="\d{1,3}" defaultValue={r.entries[1].score ?? ""} className={num} />
            {r.match.stage === "bracket" && (
              <select name="went_through" aria-label="If level, who went through" defaultValue={r.match.went_through ?? ""} className={box}>
                <option value="">If level: went through</option>
                {r.entries.map((e) => <option key={e.slot} value={e.groupId!}>{who(e)}</option>)}
              </select>
            )}
            <SubmitButton size="sm">Save</SubmitButton>
          </form>
        )}
        {ready && time && (
          <form key={key} action={save} className="flex flex-wrap items-center gap-2">
            {r.entries.map((e) => (
              <label key={e.slot} className="flex items-center gap-1 text-sm">
                <span className="max-w-28 truncate">{who(e)}</span>
                {e.forfeit
                  ? <Badge variant="warning">Forfeit</Badge>
                  : <input name={`time:${e.slot}`} aria-label={`${who(e)} time`} placeholder="1:52.30" defaultValue={e.dnf ? "DNF" : e.timeMs ? formatTime(e.timeMs) : ""} className={`${box} w-20 tabular-nums`} />}
              </label>
            ))}
            <SubmitButton size="sm">Save</SubmitButton>
          </form>
        )}
        {!ready && canPick && fixed.some((s) => !s.group_id) && (
          <Modal title={`Pick teams · ${r.label}`} trigger="Pick teams" variant="default">{pickForm}</Modal>
        )}
        {(result || (canPick && fixed.every((s) => s.group_id)) || (ready && !time) || r.match.stage === "manual") && (
          <RowActions
            name={r.label}
            edit={canPick && fixed.every((s) => s.group_id) ? { title: `Pick teams · ${r.label}`, form: pickForm } : undefined}
            actions={[
              ...(ready && !time ? r.entries.map((e) => ({ label: `Walkover to ${who(e)}`, action: walkoverAction.bind(null, ev.id, activity.id, sport.id, r.match.id, e.groupId!) })) : []),
              ...(result ? [{ label: "Clear result", action: clearResultAction.bind(null, ev.id, activity.id, sport.id, r.match.id) }] : []),
            ]}
            remove={r.match.stage === "manual" ? { action: deleteMatchAction.bind(null, ev.id, activity.id, sport.id, r.match.id), message: `Delete ${r.label}: ${r.entries.map(who).join(" v ")}? Its result goes too.` } : undefined}
          />
        )}
      </div>
    </div>
  );
}

/** D661: the places so far, with their points (D654); a forfeit scores 0. */
function Places({ sr, resolved, names, table }: { sr: SportResults; resolved: Resolved[]; names: Map<string, string>; table: number[] | null }) {
  const places = sportPlaces(sr, resolved);
  return (
    <Section title="Places">
      {places.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Places fill in as finals and 3rd-place matches finish.</p>
      ) : (
        <div className={list}>
          {places.map((p) => (
            <div key={`${p.place}-${p.groupId}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span><span className="inline-block w-10 font-bold tabular-nums">{ordinal(p.place)}</span>{names.get(p.groupId)}</span>
              {table && <span className="tabular-nums text-muted-foreground">{p.forfeit ? "0 · Forfeit" : `${pointsFor(p, table)} pts`}</span>}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/** D665: a by-hand sport - add matches, enter their results, and type each group's place. */
function ManualSport({ ev, activity, sr, names, groups }: Bound & { groups: { id: string; name: string }[] }) {
  const resolved = resolveSport(sr, names);
  const sport = sr.sport;
  const rounds = [...new Set(resolved.map((r) => r.match.round))];
  const time = sport.result_kind === "time";
  const pool = new Map(sr.pools.map((p) => [p.group_id, p]));
  return (
    <div className="flex flex-col gap-6">
      <Section title="Matches" aside={
        <Modal title={`Add a ${sport.name} match`} trigger="Add match" icon="plus" variant="default">
          <form action={addMatchAction.bind(null, ev.id, activity.id, sport.id)} className="flex flex-col gap-3">
            <Field label="Round" name="round" placeholder="Round 1" />
            {time ? (
              <fieldset className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <legend className="text-sm font-bold">Squads in this race</legend>
                {groups.map((g) => <label key={g.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="groups" value={g.id} className="size-4" />{g.name}</label>)}
              </fieldset>
            ) : (
              [0, 1].map((i) => (
                <select key={i} name="groups" aria-label={`Team ${i + 1}`} required defaultValue="" className={box}>
                  <option value="" disabled>Team {i + 1}</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              ))
            )}
            <SubmitButton>Add match</SubmitButton>
          </form>
        </Modal>
      }>
        {resolved.length === 0
          ? <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No matches yet. Add them as they&apos;re drawn up, or just type the places below.</p>
          : rounds.map((round) => (
            <div key={round} className={list}>
              {resolved.filter((r) => r.match.round === round).map((r) => <MatchRow key={r.match.id} r={r} b={{ ev, activity, sr, names }} tables={[]} resolved={resolved} />)}
            </div>
          ))}
      </Section>
      <Section title="Places">
        <form action={savePlacesAction.bind(null, ev.id, activity.id, sport.id)} className="flex flex-col gap-3">
          <div className={list}>
            {groups.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-semibold">{g.name}</span>
                <span className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5">Place <input name={`place:${g.id}`} inputMode="numeric" pattern="\d{1,3}" defaultValue={pool.get(g.id)?.manual_place ?? ""} className={num} /></label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" name={`forfeit:${g.id}`} defaultChecked={pool.get(g.id)?.forfeit ?? false} className="size-4" />Forfeit</label>
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Leave a place blank for a group that didn&apos;t play or isn&apos;t placed yet. Ties can share a place.</p>
          <SubmitButton>Save places</SubmitButton>
        </form>
      </Section>
    </div>
  );
}
