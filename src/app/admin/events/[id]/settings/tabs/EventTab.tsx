import { formKey } from "@/lib/form-key";
import { previewLink } from "@/lib/preview-link";
import { DEFAULT_COMING_SOON } from "@/lib/coming-soon";
import { EVENT_TAB_COLUMNS } from "@/lib/settings-form";
import type { Attendee, Event, EventStatus } from "@/lib/types";
import { Field } from "@/components/admin/Field";
import { SaveBar } from "@/components/admin/SaveBar";
import { ShareLink } from "@/components/admin/ShareLink";
import { StatusPicker } from "@/components/admin/StatusPicker";
import { PreviewLinkButtons } from "@/components/admin/PreviewLinkButtons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createPreviewLinkAction, previewGeneralPortalAction, replacePreviewLinkAction, setStatusAction, turnOffPreviewLinkAction, updateEventTabAction } from "../../actions";
import { Section } from "./Section";

const STATUSES: { value: EventStatus; label: string; what: string }[] = [
  { value: "draft", label: "Draft", what: "Attendees see “Coming soon” on every link." },
  { value: "live", label: "Live", what: "The portal is open to attendees." },
  { value: "archived", label: "Archived", what: "Read-only, and personal data can be purged." },
];

type Share = { url: string; qr: { src: string; href: string } };

/** D778: the event's name, dates and Coming soon wording (saved here), its status and its two share links. */
export function EventTab({ ev, admin, base, previewAs, portalShare, registrationShare }: {
  ev: Event;
  admin: boolean;
  base: string;
  /** D716: the attendee the preview link opens as, when it would still land on their page. */
  previewAs: Attendee | null;
  portalShare: Share;
  registrationShare: Share;
}) {
  const statuses = admin ? STATUSES : STATUSES.filter((s) => s.value !== "archived");
  return (
    <>
      {/* Keyed on what it saves (formKey): remounts after its own save, never after a status click. */}
      <form key={formKey(EVENT_TAB_COLUMNS.map((c) => ev[c]))} action={updateEventTabAction.bind(null, ev.id)} data-tab-label="Event" className="flex flex-col gap-4">
        <Section title="Event">
          <Field label="Name" name="name" defaultValue={ev.name} />
          {/* D633: where the big name breaks onto lines. Sentences, tab titles and WhatsApp keep the plain name. */}
          <Field label="Name as shown on the portal" name="display_name" textarea defaultValue={ev.display_name ?? ""} placeholder={ev.name}
            description="Press Enter where you want a new line, e.g. after Hub 2. Used for the big event name on the Coming soon page. Leave blank to use the name as it is." />
          {/* D635: the bar is narrow and on every page, so the breaks stay out of it unless asked. */}
          <label className="flex min-h-11 items-center gap-2 text-sm @xl:col-span-2">
            <input type="checkbox" name="display_name_in_bar" defaultChecked={ev.display_name_in_bar ?? false} className="size-4 accent-primary" />
            Also use these line breaks in the top bar
          </label>
          <Field label="Venue" name="venue_name" defaultValue={ev.venue_name} description="Shown beside the dates at the top of the portal." />
          {/* One row: at their own width the two dates sit side by side even in a half card. */}
          <div className="flex flex-wrap gap-4 @xl:col-span-2">
            <div><Field label="Starts on" name="starts_on" type="date" defaultValue={ev.starts_on} /></div>
            <div><Field label="Ends on" name="ends_on" type="date" defaultValue={ev.ends_on} /></div>
          </div>
          {/* D617: saved with this tab's Save, unlike the Status card it describes. */}
          <div className="@xl:col-span-2">
            <Field label="Coming soon message" name="coming_soon_message" textarea defaultValue={ev.coming_soon_message ?? ""} placeholder={DEFAULT_COMING_SOON}
              description="What every link shows while the event is a draft. Line breaks are kept. Leave blank to use the placeholder text." />
          </div>
        </Section>
        <SaveBar label="Save" note="Saves this tab." />
      </form>

      {/* Status and the share links apply on click, so they sit outside the tab's form: status
          is plain buttons calling its action, and none of it waits for Save. */}
      <div className="grid gap-4 @4xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <CardDescription>Applies the moment you choose it — there is no separate save.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusPicker current={ev.status} statuses={statuses} setStatus={setStatusAction.bind(null, ev.id)} />
            {/* D715: the client's way to see the draft as live, no login. On this host, not the
                event's own address: the link's cookie belongs to the host that set it. */}
            {ev.status === "draft" && (
              <div className="mt-4 flex flex-col gap-3 border-t pt-4">
                <div>
                  <p className="text-sm font-semibold">Preview link</p>
                  <p className="text-xs text-muted-foreground">
                    Send this to the client to see the portal as it will look live, without logging in. Attendees still see “Coming soon”. Anyone with the link can open it, so replace it if it goes further than it should.
                  </p>
                </div>
                {ev.preview_token && <ShareLink label="Preview" url={previewLink(base, ev.slug, ev.preview_token)} />}
                {/* D716: who it opens as. Chosen on the attendee's panel, where you already pick a person. */}
                {ev.preview_token && (
                  <p className="text-xs text-muted-foreground">
                    {previewAs
                      ? <>Opens as <span className="font-semibold text-foreground">{previewAs.name}</span>, with their badge and details. To change who, choose Use for preview link on someone else in Attendees.</>
                      : "Opens the general portal, with no one's badge. To open as one person, choose Use for preview link on them in Attendees: a test attendee you add, or someone on the committee."}
                  </p>
                )}
                <PreviewLinkButtons exists={!!ev.preview_token} create={createPreviewLinkAction.bind(null, ev.id)}
                  replace={replacePreviewLinkAction.bind(null, ev.id)} turnOff={turnOffPreviewLinkAction.bind(null, ev.id)}
                  general={previewAs ? previewGeneralPortalAction.bind(null, ev.id) : undefined} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Share links</CardTitle>
            <CardDescription>The two addresses you hand out. Personal per-attendee links are in Exports.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ShareLink label="Portal" {...portalShare} />
            <ShareLink label="Registration" {...registrationShare} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
