import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { activeCheckpoint, checkpointsByDay } from "@/lib/checkpoints";
import { eventDays, nowInKL } from "@/lib/time";
import { shortDate } from "@/lib/text";
import { countCheckinsByCheckpoint } from "@/lib/db/checkins";
import { countAttendees } from "@/lib/db/attendees";
import { appBaseUrl, genericLink, registrationLink, crewLink } from "@/lib/links";
import { crewLinkLastDay } from "@/lib/crew";
import { Field } from "@/components/admin/Field";
import { ImageField } from "@/components/admin/ImageField";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { CopyButton } from "@/components/admin/CopyButton";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { updateSettingsAction, setStatusAction, purgeEventAction, addCheckpointAction, deleteCheckpointAction, reorderCheckpointsAction, addPinAction, removePinAction, reorderPinsAction, rotateCrewTokenAction } from "../actions";
import { CheckpointList } from "@/components/admin/CheckpointList";
import { PinList } from "@/components/admin/PinList";
import { pinnableFields, MAX_PINS } from "@/lib/pinned-fields";
import { Modal } from "@/components/admin/Modal";
import { isoToLocalInput } from "@/lib/time";
import { MAX_QUESTIONS } from "@/lib/questions-form";
import type { EventStatus } from "@/lib/types";

export const metadata = { title: "Settings · Orange Lobby" };

const input = "w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const STATUSES: { value: EventStatus; label: string; what: string }[] = [
  { value: "draft", label: "Draft", what: "Every link shows “Coming soon”." },
  { value: "live", label: "Live", what: "The portal is open to attendees." },
  { value: "archived", label: "Archived", what: "Read-only, and personal data can be purged." },
];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="@container">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {hint && <CardDescription>{hint}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-4 @xl:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

/**
 * Every editable panel posts the SAME form. updateSettingsAction writes every column on
 * every save - a form carrying only one tab's fields would blank the other, and blanking
 * registration_questions would take the live registration form down with it. So the tabs
 * are presentation; the form spans them, and this bar saves all of it from wherever you
 * happen to be standing.
 */
function SaveBar() {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6 2xl:-mx-8 2xl:px-8">
      <SubmitButton>Save settings</SubmitButton>
      <span className="text-xs text-muted-foreground">Saves every tab, not just this one. Changes apply to the portal immediately.</span>
    </div>
  );
}

function ShareLink({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <a href={url} className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-xs text-primary">{url}</a>
        <CopyButton value={url} label={`${label.toLowerCase()} link`} />
      </div>
    </div>
  );
}

export default async function Settings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const qs = ev.registration_questions;
  const base = appBaseUrl();
  const [cps, cpCounts, total] = await Promise.all([
    listCheckpoints(ev.id), countCheckinsByCheckpoint(ev.id), countAttendees(ev.id),
  ]);
  const grouped = checkpointsByDay(cps);
  const running = activeCheckpoint(ev.active_checkpoint_id, cps, nowInKL().date);
  const days = eventDays(ev.starts_on, ev.ends_on);
  const crewExpiry = crewLinkLastDay(ev);

  const pinnable = pinnableFields(ev.registration_questions, ev.attendee_fields);
  const pinnedKeys = new Set(ev.pinned_fields.map((p) => p.key));

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title="Settings" subtitle={ev.name} />

      <Tabs defaultValue="details" className="gap-4">
        <TabsList>
          <TabsTrigger value="details">Event details</TabsTrigger>
          <TabsTrigger value="registration">Registration form</TabsTrigger>
          <TabsTrigger value="share">Share &amp; access</TabsTrigger>
          <TabsTrigger value="checkpoints">Checkpoints</TabsTrigger>
          <TabsTrigger value="badge">Badge</TabsTrigger>
          {ev.status === "archived" && <TabsTrigger value="danger">Danger zone</TabsTrigger>}
        </TabsList>

      <TabsContent value="share" className="flex flex-col gap-4 @container">
      <div className="grid gap-4 @3xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <CardDescription>Applies the moment you choose it — there is no separate save.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <form key={s.value} action={setStatusAction.bind(null, ev.id, s.value)}>
                  <Button
                    variant={ev.status === s.value ? "default" : "outline"}
                    aria-current={ev.status === s.value ? "true" : undefined}
                  >
                    {s.label}
                  </Button>
                </form>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{STATUSES.find((s) => s.value === ev.status)?.what}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Share links</CardTitle>
            <CardDescription>The two addresses you hand out. Personal per-attendee links are in Exports.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ShareLink label="Portal" url={genericLink(base, ev.slug)} />
            <ShareLink label="Registration" url={registrationLink(base, ev.slug)} />
          </CardContent>
        </Card>
      </div>
      </TabsContent>

      <TabsContent value="checkpoints" className="flex flex-col gap-4 @container">
      <Card>
        <CardHeader>
          <CardTitle>Checkpoints</CardTitle>
          <CardDescription>The doors this event runs. Which one is live is chosen on the Overview. A day can hold several — registration, lunch, a dinner door.</CardDescription>
          <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
          <Modal title="New checkpoint" hint="A checkpoint is a moment on a date, so several can share one day." trigger="New checkpoint" icon="plus" iconOnly>
            <form action={addCheckpointAction.bind(null, ev.id)} className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" name="name" placeholder="Registration" />
              <Field label="Date" name="day" type="date" defaultValue={days[0] ?? ev.starts_on} />
              <div className="sm:col-span-2"><SubmitButton>Add checkpoint</SubmitButton></div>
            </form>
          </Modal>
          </div>
        </CardHeader>
        <CardContent>
        {grouped.length === 0 ? (
          <Empty className="border-0 bg-transparent">
            <EmptyHeader>
              <EmptyTitle>No checkpoints yet</EmptyTitle>
              <EmptyDescription>Add &ldquo;Registration&rdquo; on the first morning to get started.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {grouped.map((g) => (
              <div key={g.day} className="flex flex-col gap-1.5">
                <h3 className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">{shortDate(g.day)}</h3>
                <CheckpointList
                  day={shortDate(g.day)}
                  items={g.items}
                  counts={cpCounts}
                  total={total}
                  activeId={running?.id ?? null}
                  reorder={reorderCheckpointsAction.bind(null, ev.id, g.day)}
                  deleteCheckpoint={deleteCheckpointAction.bind(null, ev.id)}
                />
              </div>
            ))}
          </div>
        )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Crew link</CardTitle>
          <CardDescription>
            One shared link for everyone scanning at this event&apos;s doors. Anyone holding it can scan attendees in — and can see the full attendee list. Hand it out like a shared password, not a personal invite.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {ev.crew_token ? (
            <>
              <ShareLink label="Crew" url={crewLink(base, ev.crew_token)} />
              <p className="text-xs tabular-nums text-muted-foreground">
                {crewExpiry ? `Stops working after ${shortDate(crewExpiry)}.` : "This link does not expire, because the event has no dates."}
              </p>
              <form action={rotateCrewTokenAction.bind(null, ev.id)}>
                <ConfirmButton message="Replace the crew link? The old one stops working immediately, and every copy already handed out will be turned away.">
                  Replace link
                </ConfirmButton>
              </form>
            </>
          ) : (
            <form action={rotateCrewTokenAction.bind(null, ev.id)}>
              <SubmitButton>Create crew link</SubmitButton>
            </form>
          )}
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="badge">
      <Card>
        <CardHeader>
          <CardTitle>Pinned on the badge</CardTitle>
          <CardDescription>
            Up to {MAX_PINS} facts shown under an attendee&apos;s name on the portal home. The first gets the
            large treatment. Someone with no value for a pinned field simply does not see it.
          </CardDescription>
          <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
          <Modal title="Pin a field" hint="Anything the event knows about an attendee: a column you added, an answer they gave, or a built-in like the table number." trigger="Pin a field" icon="plus" iconOnly>
            <form action={addPinAction.bind(null, ev.id)} className="grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="pin_key">Field</label>
                <select id="pin_key" name="key" className={input} defaultValue="">
                  <option value="" disabled>Choose a field</option>
                  {pinnable.filter((f) => !pinnedKeys.has(f.key)).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </div>
              <Field label="Shown as (optional)" name="label" placeholder="Partner" description="A short caption for the badge. Leave blank to use the field&apos;s own name." />
              <SubmitButton>Pin to the badge</SubmitButton>
            </form>
          </Modal>
          </div>
        </CardHeader>
        <CardContent>
          <PinList
            pins={ev.pinned_fields}
            labels={Object.fromEntries(pinnable.map((f) => [f.key, f.label]))}
            reorder={reorderPinsAction.bind(null, ev.id)}
            remove={removePinAction.bind(null, ev.id)}
          />
        </CardContent>
      </Card>
      </TabsContent>

      {/* ONE form across both editable panels - see SaveBar. keepMounted is what makes it
          safe: an unmounted panel posts no fields, and this action writes every column. */}
      <form action={updateSettingsAction.bind(null, ev.id)}>
        <TabsContent value="details" keepMounted className="flex flex-col gap-4 @container">
        <div className="grid gap-4 @4xl:grid-cols-2">
          <Section title="Event">
            <Field label="Name" name="name" defaultValue={ev.name} />
            <Field label="Primary colour" name="primary_color" type="color" defaultValue={ev.primary_color} />
            <Field label="Starts on" name="starts_on" type="date" defaultValue={ev.starts_on} />
            <Field label="Ends on" name="ends_on" type="date" defaultValue={ev.ends_on} />
            <div className="@xl:col-span-2"><Field label="Description shown on the info page" name="description" textarea defaultValue={ev.description} /></div>
          </Section>

          <Section title="Venue and contact">
            <Field label="Venue name" name="venue_name" defaultValue={ev.venue_name} />
            <Field label="Venue address" name="venue_address" defaultValue={ev.venue_address} />
            <div className="@xl:col-span-2"><Field label="Map link (https)" name="venue_map_url" defaultValue={ev.venue_map_url} placeholder="https://maps.app.goo.gl/…" /></div>
            <Field label="Event desk contact name" name="contact_name" defaultValue={ev.contact_name} />
            <Field label="Event desk phone" name="contact_phone" defaultValue={ev.contact_phone} />
          </Section>

          <Section title="Branding and images" hint="Upload the event's images. The logo replaces the initials mark; the banner appears above the home page.">
            <ImageField label="Logo" name="logo" url={ev.logo_url} />
            <ImageField label="Banner" name="banner" url={ev.banner_url} />
          </Section>

          <Section title="Onsite scanner" hint="After a scan, crew see name, company, category and table. Add up to two more fields, for example shirt_size or dietary.">
            <div className="@xl:col-span-2"><Field label="Extra fields on the scan card" name="scan_extra_fields" defaultValue={ev.scan_extra_fields.join(", ")} placeholder="shirt_size, dietary" /></div>
          </Section>
        </div>
        <SaveBar />
        </TabsContent>

        <TabsContent value="registration" keepMounted className="flex flex-col gap-4 @container">
        <Card>
          <CardHeader>
            <CardTitle>Registration</CardTitle>
            <CardDescription>When the form is open, and what it asks.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
          <div className="grid gap-4 @xl:grid-cols-2">
            <label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" name="registration_open" defaultChecked={ev.registration_open} className="size-4 accent-primary" /> Registration is open</label>
            <Field label="Closes automatically at" name="registration_closes_at" type="datetime-local" defaultValue={isoToLocalInput(ev.registration_closes_at)} />
          </div>
          <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-extrabold">Questions</h3>
          <p className="text-xs text-muted-foreground">Name, email, mobile and department are always asked. Add up to {MAX_QUESTIONS} more. Leave a row blank to remove it. &ldquo;Show only when&rdquo; hides a question until another answer contains the phrase, for example show &ldquo;Room partner&rdquo; only when &ldquo;stay_overnight&rdquo; contains &ldquo;Twin&rdquo;.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="p-1.5">#</th><th className="p-1.5">Label</th><th className="p-1.5">Key</th><th className="p-1.5">Type</th><th className="p-1.5">Required</th><th className="p-1.5">Options (comma separated)</th><th className="p-1.5">Help text</th><th className="p-1.5">Show only when</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: MAX_QUESTIONS }, (_, i) => i + 1).map((n) => {
                  const q = qs[n - 1];
                  return (
                    <tr key={n} className="border-t border-border align-top">
                      <td className="p-1.5 pt-3 text-xs text-muted-foreground">{n}</td>
                      <td className="p-1.5"><input name={`q_${n}_label`} defaultValue={q?.label ?? ""} aria-label={`Question ${n} label`} className={input} /></td>
                      <td className="p-1.5"><input name={`q_${n}_key`} defaultValue={q?.key ?? ""} aria-label={`Question ${n} key`} placeholder="auto" className={`${input} font-mono text-xs`} /></td>
                      <td className="p-1.5">
                        <select name={`q_${n}_type`} defaultValue={q?.type ?? "text"} aria-label={`Question ${n} type`} className={input}><option value="text">Text</option><option value="phone">Phone</option><option value="number">Number</option><option value="select">Choice</option></select>
                      </td>
                      <td className="p-1.5 pt-3 text-center"><input type="checkbox" name={`q_${n}_required`} defaultChecked={q?.required ?? false} aria-label={`Question ${n} required`} className="size-4 accent-primary" /></td>
                      <td className="p-1.5"><input name={`q_${n}_options`} defaultValue={q?.options?.join(", ") ?? ""} aria-label={`Question ${n} options`} className={input} /></td>
                      <td className="p-1.5"><input name={`q_${n}_description`} defaultValue={q?.description ?? ""} aria-label={`Question ${n} help text`} className={input} /></td>
                      <td className="p-1.5">
                        <div className="flex gap-1">
                          <input name={`q_${n}_show_key`} defaultValue={q?.show_when?.key ?? ""} aria-label={`Question ${n} depends on key`} placeholder="key" className={`${input} font-mono text-xs`} />
                          <input name={`q_${n}_show_value`} defaultValue={q?.show_when?.includes ?? ""} aria-label={`Question ${n} depends on value`} placeholder="contains" className={input} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </CardContent>
        </Card>
        <SaveBar />
        </TabsContent>
      </form>

      {ev.status === "archived" && (
        <TabsContent value="danger">
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive">Purge personal data</CardTitle>
              <CardDescription>
                Replaces names, emails, phones, companies and extra fields across this event. Attendance counts are kept. This cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={purgeEventAction.bind(null, ev.id)}>
                <ConfirmButton message="Purge all attendee personal data for this event? This cannot be undone." className="text-destructive">Purge</ConfirmButton>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      )}
      </Tabs>
    </div>
  );
}
