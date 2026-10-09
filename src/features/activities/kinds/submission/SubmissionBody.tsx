import { CalendarDays, CircleCheck, MapPin, Users } from "lucide-react";
import { loadPortalAttendee } from "@/lib/portal";
import { type SubmissionEntry } from "@/lib/portal-activity-entries";
import { dayRange } from "@/lib/activity-card";
import { EntryActions } from "./EntryActions";
import { SubmissionHistory, type EditEntry } from "./SubmissionHistory";
import { GroupStatus } from "./GroupStatus";
import { SubmissionFields } from "./SubmissionFields";
import { HealthConsentField } from "./HealthConsentField";
import { SubmitFor } from "./SubmitFor";
import { ActivityActionDialog } from "../../portal/ActivityActionDialog";
import { canEditOwn, isGroupForm, isProxy, submitLabel, type SubmitState } from "@/lib/submissions";
import { nowInKL } from "@/lib/time";
import { submissionsAddedBy } from "@/lib/db/activities";
import { groupMembers } from "@/lib/db/groups";
import { listAttendeesByIds } from "@/lib/db/attendees";
import { type Activity, type ActivitySubmission, type Attendee } from "@/lib/types";
import { submitAnswersAction, editMySubmissionAction, deleteMySubmissionAction } from "../../portal/actions";
import { portalFileHref } from "@/lib/file-links";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { hasHealthConsent } from "@/lib/db/health-consents";
import { RichSections } from "@/components/portal/RichSections";
import { block, note, forGroups, InfoRows } from "../../portal/detail-parts";

/**
 * D391/D398: Edit and Delete on each entry this attendee may still change (`canEditOwn`) - the
 * edit in a dialog like the submit's, filled with what they sent. Keyed by the edit stamp, so a
 * save remounts it closed and a refusal leaves it open with the toast saying why - the submit
 * dialog's own contract. A delete redirects back to a page without the entry.
 */
export function editorFor(f: Activity, slug: string, token: string, attendee: Pick<Attendee, "id" | "category">): EditEntry | undefined {
  if (!f.attendee_edit || f.questions.length === 0) return undefined;
  const today = nowInKL().date;
  return function EditLink(s, fileLinks, variant = "links") {
    if (!canEditOwn(f, s, attendee.id, attendee.category, today)) return null;
    return (
      <EntryActions key={s.attendee_edited_at ?? "unedited"} title={f.name} variant={variant}
        remove={deleteMySubmissionAction.bind(null, slug, token, f.id, s.id)}
        editForm={
          <form action={editMySubmissionAction.bind(null, slug, token, f.id, s.id)} className="flex flex-col gap-6">
            {s.attendee_id === attendee.id && <HealthConsentAsk f={f} slug={slug} token={token} id={`health-consent-${s.id}`} />}
            <SubmissionFields questions={f.questions} defaults={s.answers} fileLinks={fileLinks} />
            <SubmitButton className="h-12 w-full text-base font-bold">Save changes</SubmitButton>
          </form>
        } />
    );
  };
}

/**
 * D392: what an attendee who may submit for their group needs - the other members, and what
 * they already sent for them today (theirs to check and, where D391 allows, edit). Null for
 * everyone else, which is nearly everyone, so the reads happen only for a proxy.
 */
export type Proxy = { members: Attendee[]; added: ActivitySubmission[] };

export async function proxyFor(f: Activity, attendee: Attendee): Promise<Proxy | null> {
  if (!attendee.group_id || !isProxy(f, attendee)) return null;
  const [members, added] = await Promise.all([
    groupMembers(f.event_id, attendee.group_id),
    submissionsAddedBy(f.id, attendee.id, nowInKL().date),
  ]);
  return { members: members.filter((m) => m.id !== attendee.id), added };
}

/** D392: "Added by <name>" for entries a group member sent for this attendee. One read, and only when there are any. */
export async function addedByLine(eventId: string, entries: Pick<ActivitySubmission, "submitted_by">[]) {
  const ids = [...new Set(entries.flatMap((s) => (s.submitted_by ? [s.submitted_by] : [])))];
  const names = new Map(ids.length ? (await listAttendeesByIds(eventId, ids)).map((a) => [a.id, a.name]) : []);
  return (s: ActivitySubmission) => (s.submitted_by ? `Added by ${names.get(s.submitted_by) ?? "a group member"}` : null);
}

/** Whether the submit dialog shows: their own entry is open, or (D392) they may send one for a member. */
export function canAdd(state: SubmitState, proxy: Proxy | null): boolean {
  return state.can || (!!proxy?.members.length && !["closed", "ineligible", "nogroup"].includes(state.reason));
}

/** The submit dialog's form, with D392's "Submitting for" picker for someone who may submit for their group. */
export function SubmitForm({ f, slug, token, state, proxy }: { f: Activity; slug: string; token: string; state: SubmitState; proxy: Proxy | null }) {
  return (
    <form action={submitAnswersAction.bind(null, slug, token, f.id)} className="flex flex-col gap-6">
      {proxy && proxy.members.length > 0 && <SubmitFor members={proxy.members} self={state.can} />}
      <HealthConsentAsk f={f} slug={slug} token={token} id="health-consent" />
      {f.questions.length > 0 && <SubmissionFields questions={f.questions} />}
      <SubmitButton className="h-12 w-full text-base font-bold">Submit</SubmitButton>
    </form>
  );
}

/**
 * D412: a health-data activity's consent tick, for as long as this attendee has not given it.
 * Reads for itself (memoised per request) so neither form has to be handed the answer.
 */
async function HealthConsentAsk({ f, slug, token, id }: { f: Activity; slug: string; token: string; id: string }) {
  if (!f.health_data) return null;
  const { attendee } = await loadPortalAttendee(slug, token);
  return (await hasHealthConsent(attendee.id, f.id)) ? null : <HealthConsentField id={id} />;
}

/** D399: "View file" on the portal goes through the attendee's own file route, signed at the click. */
const filesFor = (slug: string, token: string) => (s: ActivitySubmission, key: string) => portalFileHref(slug, token, s.id, key);

/** D392: what a proxy sent for their group today, each card saying for whom, with Edit where allowed. */
export function AddedForGroup({ f, slug, token, proxy, edit }: { f: Activity; slug: string; token: string; proxy: Proxy | null; edit?: EditEntry }) {
  if (!proxy || proxy.added.length === 0) return null;
  const name = new Map(proxy.members.map((m) => [m.id, m.name]));
  return (
    <div className="mt-4">
      <SubmissionHistory submissions={proxy.added} questions={f.questions} fileHref={filesFor(slug, token)} title="You added for your group today"
        byline={(s) => `For ${name.get(s.attendee_id) ?? "a former member"}`} edit={edit} />
    </div>
  );
}

export async function SubmissionBody({ entry: { form: f, state, mine, group }, slug, token, writing, people, selfId, edit, proxy }: {
  entry: SubmissionEntry;
  slug: string;
  token: string;
  writing: boolean;
  people: Record<string, { name: string; movedTo: string | null }>;
  selfId: string;
  edit?: EditEntry;
  proxy: Proxy | null;
}) {
  const dates = f.starts_on ? dayRange([f.starts_on, f.ends_on ?? f.starts_on]) : null;
  const addedBy = await addedByLine(f.event_id, mine);
  return (
    <>
      <InfoRows rows={[{ icon: CalendarDays, text: dates }, { icon: MapPin, text: f.venue }, { icon: Users, text: forGroups(f) }]} />
      <RichSections html={f.description} />
      <section className={block}>
        {/* D369: members mode is per-person, so it shows the person's own history like "off". */}
        {!isGroupForm(f.group_mode) && (
          <>
            {(state.reason === "limit" || state.reason === "today") && <Done today={state.reason === "today"} />}
            <SubmissionHistory submissions={mine} questions={f.questions} fileHref={filesFor(slug, token)} edit={edit} addedBy={addedBy} />
            <AddedForGroup f={f} slug={slug} token={token} proxy={proxy} edit={edit} />
          </>
        )}
        {/* D352: an ineligible viewer gets the plain note below, not the group block - it names */}
        {/* a group they aren't measured against. */}
        {isGroupForm(f.group_mode) && state.reason !== "ineligible" && (
          <>
            {/* D353: at most one banner - the group being done trumps any per-person reason. */}
            {group?.done ? (
              <GroupDone text="Your group is done" />
            ) : state.reason === "limit" && group ? (
              <GroupDone text={`You've submitted — waiting on ${group.need - group.have} other${group.need - group.have === 1 ? "" : "s"}`} />
            ) : null}
            {group && <GroupStatus form={f} group={group} people={people} selfId={selfId} edit={edit} fileHref={filesFor(slug, token)} />}
            {state.reason === "nogroup" && <p className={note}>You need to be in a group to submit this.</p>}
          </>
        )}
        {f.group_mode === "members" && state.reason === "nogroup" && <p className={`mt-3 ${note}`}>You need to be in a team to submit this.</p>}
        {state.reason === "closed" && <p className={`mt-3 ${note}`}>Submissions for this are closed.</p>}
        {state.reason === "ineligible" && <p className={`mt-3 ${note}`}>This is not open to your group.</p>}
      </section>
      {canAdd(state, proxy) && (
        // D392: what a proxy sent for others counts too, so their submit also remounts it closed.
        <ActivityActionDialog key={`${group ? group.entries.length : mine.length}:${proxy?.added.length ?? 0}`} label={submitLabel(f)} title={f.name} defaultOpen={writing}>
          <SubmitForm f={f} slug={slug} token={token} state={state} proxy={proxy} />
        </ActivityActionDialog>
      )}
    </>
  );
}

/** The good news where the button was: a green tick, and for a daily one, when to come back. */
function Done({ today }: { today: boolean }) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-success-strong">
      <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div>
        <div className="font-bold">{today ? "Submission done for today" : "Submission done"}</div>
        {today && <div className="text-sm">Come back tomorrow to send the next one.</div>}
      </div>
    </div>
  );
}

/** A group form's version of Done (D353): the group's news, in one line. */
function GroupDone({ text }: { text: string }) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-success/30 bg-success-soft px-4 py-3 font-bold text-success-strong">
      <CircleCheck aria-hidden className="size-5 shrink-0" />{text}
    </div>
  );
}
