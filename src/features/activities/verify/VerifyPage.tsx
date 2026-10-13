import Link from "next/link";
import { Flag } from "lucide-react";
import { getEvent } from "@/lib/db/events";
import { listAttendees, listAttendeesByIds } from "@/lib/db/attendees";
import { listGroups } from "@/lib/db/groups";
import { allow } from "@/lib/ratelimit";
import { brandStyle } from "@/lib/brand";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { listActivities } from "../db/activities";
import { verifierByToken, submissionsForVerify, verifierNames } from "../db/verifiers";
import { resolveVerifier, verifyQuery, verifyQueryString } from "../lib/verifier";
import { reasonsOf, revokeCredit } from "../lib/revoke";
import { revokeAsVerifierAction } from "./actions";
import { VerifyCard } from "./VerifyCard";

const select = "h-11 rounded-md border border-input bg-background px-3 text-sm";

/** Copy from the Global Constraints. The same screen for a malformed, unknown, removed or replaced link. */
export function InvalidVerifyLink() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-6">
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Flag /></EmptyMedia>
          <EmptyTitle>This link isn&apos;t valid</EmptyTitle>
          <EmptyDescription>Ask the organiser for the right one.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}

/**
 * D495: the verifier's page - one event's submissions, newest first, to check and revoke.
 * Plain GET filters and Older/Newer links, so it works on any phone with no client state.
 * Admin revokes show as "an admin": a verifier is not shown organisers' emails.
 */
export async function VerifyPage({ token, search }: { token: string; search: Record<string, string | undefined> }) {
  const link = await resolveVerifier(token, verifierByToken);
  if (!link || !allow(`verify-page:${link.id}`, 120, 60_000)) return <InvalidVerifyLink />;
  const ev = await getEvent(link.event_id);
  if (!ev) return <InvalidVerifyLink />;

  const q = verifyQuery(search);
  const forms = await listActivities(ev.id, "submission");
  const formById = new Map(forms.map((f) => [f.id, f]));
  const chosen = q.activity && formById.has(q.activity) ? [q.activity] : forms.map((f) => f.id);
  // A name search narrows to at most 200 people, which keeps the `in` filter's URL sane.
  const matched = q.q ? (await listAttendees(ev.id, q.q, "name")).slice(0, 200).map((a) => a.id) : null;
  const { rows, more } = await submissionsForVerify({ eventId: ev.id, activityIds: chosen, status: q.status, attendeeIds: matched, page: q.page });

  const [people, groups, verifiers] = await Promise.all([
    listAttendeesByIds(ev.id, [...new Set(rows.map((r) => r.attendee_id))]),
    listGroups(ev.id),
    verifierNames(rows.map((r) => r.revoked_by_verifier)),
  ]);
  const nameOf = new Map(people.map((a) => [a.id, a.name]));
  const groupOf = new Map(groups.map((g) => [g.id, g.name]));
  const reasons = reasonsOf(ev);
  const query = verifyQueryString(q).slice(1);
  const here = (patch: Partial<typeof q>) => `/verify/${token}${verifyQueryString(q, patch)}`;

  return (
    <main style={brandStyle(ev.primary_color)} className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{ev.name}</p>
        <h1 className="text-xl font-extrabold">Verifying as {link.name}</h1>
        <p className="text-sm text-muted-foreground">Check each entry&apos;s proof. Revoke one that doesn&apos;t qualify and pick why; the attendee sees the reason and can send a new one.</p>
      </header>

      {forms.length === 0 ? (
        <p className="text-sm text-muted-foreground">This event has no submission activities yet.</p>
      ) : (
        <>
          <form method="get" className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
            <select name="activity" defaultValue={q.activity ?? ""} className={select} aria-label="Activity">
              <option value="">All activities</option>
              {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select name="status" defaultValue={q.status} className={select} aria-label="Show">
              <option value="submitted">To check</option>
              <option value="revoked">Revoked</option>
              <option value="all">All</option>
            </select>
            <input name="q" defaultValue={q.q} placeholder="Attendee name" className={select} aria-label="Attendee name" />
            <SubmitButton className="h-11">Filter</SubmitButton>
          </form>

          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nothing here.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((s) => (
                <VerifyCard
                  key={s.id}
                  s={s}
                  activity={formById.get(s.activity_id)!}
                  who={nameOf.get(s.attendee_id) ?? "Unknown"}
                  group={s.group_id ? groupOf.get(s.group_id) ?? null : null}
                  token={token}
                  credit={s.status === "revoked" ? revokeCredit(s, { admins: {}, verifiers }) : null}
                  reasons={reasons}
                  revoke={revokeAsVerifierAction.bind(null, token, query, s.id)}
                />
              ))}
            </div>
          )}

          {(q.page > 0 || more) && (
            <nav className="flex justify-between">
              {q.page > 0 ? <Link href={here({ page: q.page - 1 })} className="text-sm font-bold text-primary">Newer</Link> : <span />}
              {more ? <Link href={here({ page: q.page + 1 })} className="text-sm font-bold text-primary">Older</Link> : <span />}
            </nav>
          )}
        </>
      )}
    </main>
  );
}
