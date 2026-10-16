import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { loadPortalAttendee, isUnpublished } from "@/lib/portal";
import { loadActivityEntries } from "../lib/portal-activity-entries";
import { findEntry, type FoundEntry } from "../cards";
import { ActivityCover } from "./ActivityParts";
import { trackerTab } from "../lib/tracker";
import { BookingBody } from "../kinds/booking/BookingBody";
import { editorFor, proxyFor, SubmissionBody } from "../kinds/submission/SubmissionBody";
import { TrackerBody } from "../kinds/submission/scoring/TrackerBody";
import { eventFields } from "@/lib/attendee-fields";
import { PassportBody } from "../kinds/passport/PassportBody";
import { PolaroidBody } from "../kinds/polaroid/PolaroidBody";
import { TournamentBody } from "../kinds/tournament/TournamentBody";
import { TITLE_INK } from "@/lib/ink";

/**
 * One activity's own page, the same shape for every kind (D178): the picture whole, the
 * name, when and where, the organiser's About and sections, where the attendee stands - then
 * one button at the foot of the page that opens what they do here in a dialog: the session
 * grid, or the submission's questions. A passport has no dialog and no button - the attendee
 * does nothing here, a booth scans their badge (D90).
 *
 * Every action redirects back here, so the toast lands on the page it is about. The dialog is
 * keyed by what each action changes (seats held and requests open; submissions sent), so a
 * success remounts it closed and a refusal leaves it open.
 *
 * A scored challenge (D374) swaps the submission body for its tracker, in three tabs (D385):
 * `?tab=info`, My stats (no param; `?day=` shows another day of it) and `?tab=leaderboard`.
 *
 * A polaroid wall's page is only its full-screen camera (D482): no back link, cover or title.
 */
export async function ActivityPage({ params, searchParams }: {
  params: Promise<{ slug: string; token: string; activityId: string }>;
  searchParams: Promise<{ new?: string | string[]; day?: string | string[]; tab?: string | string[]; sport?: string | string[]; view?: string | string[]; show?: string | string[] }>;
}) {
  const { slug, token, activityId } = await params;
  const { new: writing, day, tab, sport, view, show } = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // A draft shows only "Coming soon" (the layout's chrome); see isUnpublished.
  if (isUnpublished(event)) return null;
  const entries = await loadActivityEntries(event, attendee);
  const basePath = `/e/${slug}/a/${token}`;

  const found = findEntry(entries, activityId);
  if (!found) notFound();
  const { activity } = found;
  const proxy = found.kind === "submission" ? await proxyFor(found.entry.form, attendee) : null;

  // One case per kind (D416): a kind added to ActivityKind does not build until it has a body here.
  function body(found: FoundEntry) {
    switch (found.kind) {
      case "booking":
        return <BookingBody entry={found.entry} slug={slug} token={token} />;
      case "submission": {
        const form = found.entry;
        return form.form.scoring
          ? <TrackerBody entry={form} slug={slug} token={token} attendeeId={attendee.id} teamId={attendee.group_id} eventStartsOn={event.starts_on} edit={editorFor(form.form, slug, token, attendee)} proxy={proxy}
              // D517: rosters follow the All groups switch - one switch for seeing other teams' members.
              rosters={event.all_groups ? { groupFields: event.group_fields, fields: eventFields(event.registration_questions, event.attendee_fields) } : null}
              day={typeof day === "string" ? day : null} writing={writing === "1"}
              // An old `?new=1` link opens the add dialog, which lives on My stats (D385).
              tab={writing === "1" ? "stats" : trackerTab(typeof tab === "string" ? tab : undefined, form.form.show_leaderboard)} />
          : <SubmissionBody entry={form} slug={slug} token={token} writing={writing === "1"} people={entries.people} selfId={attendee.id} edit={editorFor(form.form, slug, token, attendee)} proxy={proxy} />;
      }
      case "passport":
        return <PassportBody entry={found.entry} attendeeName={attendee.name} />;
      case "polaroid":
        return <PolaroidBody entry={found.entry} slug={slug} token={token} brand={event.primary_color} />;
      case "tournament":
        return <TournamentBody entry={found.entry} slug={slug} token={token} sport={one(sport)} view={one(view)} show={one(show)} />;
      default: {
        const exhaustive: never = found;
        throw new Error(`Unhandled activity kind: ${String((exhaustive as { kind: string }).kind)}`);
      }
    }
  }

  if (found.kind === "polaroid") return body(found);

  return (
    <div className="flex flex-col">
      <Link href={`${basePath}/activities`} className="mb-3 inline-flex items-center gap-1.5 self-start text-sm font-bold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />Activities
      </Link>
      <ActivityCover activity={activity} variant="hero" />
      <h1 className={`py-4 text-xl font-extrabold leading-tight ${TITLE_INK}`}>{activity.name}</h1>
      {body(found)}
    </div>
  );
}
