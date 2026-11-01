import { formKey } from "@/lib/form-key";
import { meGroups } from "@/lib/me-page";
import { MAX_PINS } from "@/lib/pinned-fields";
import { PORTAL_LOOK_COLUMNS } from "@/lib/settings-form";
import type { AttendeeField } from "@/lib/attendee-fields";
import type { Event } from "@/lib/types";
import { EMPTY_THEME, ThemeCard } from "@/features/theme";
import { Field } from "@/components/admin/Field";
import { ImageField } from "@/components/admin/ImageField";
import { Modal } from "@/components/admin/Modal";
import { PinList } from "@/components/admin/PinList";
import { SaveBar } from "@/components/admin/SaveBar";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addPinAction, removePinAction, reorderPinsAction, updatePortalLookAction } from "../../actions";
import { Section } from "./Section";
import { SELECT_CLASS } from "./styles";

/**
 * D778: how the portal looks. Logo, banner, theme, the Me page and (with the Language add-on, D738)
 * the EN | BM switch save with this tab's Save, whose bar ends the tab. The badge pins save as you
 * go, so they sit above the tab's form, never in it or after it.
 */
export function PortalLookTab({ ev, showLanguage, pinnable }: {
  ev: Event;
  /** The Language add-on is on. With it off the action keeps the stored switch as it is. */
  showLanguage: boolean;
  pinnable: AttendeeField[];
}) {
  const pinnedKeys = new Set(ev.pinned_fields.map((p) => p.key));
  return (
    <>
      {/* Saved as you go, so it sits above the tab's form: unpin and reorder are plain calls, and the pin
          dialog has a form of its own. */}
      <Card>
        <CardHeader>
          <CardTitle>Pinned on the badge</CardTitle>
          <CardDescription>
            Up to {MAX_PINS} facts shown under an attendee&apos;s name on the portal home. The first gets the
            large treatment. Someone with no value for a pinned field simply does not see it. Saved as you go.
          </CardDescription>
          <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
          <Modal title="Pin a field" hint="Anything the event knows about an attendee: a column you added, an answer they gave, or a built-in like the table number." trigger="Pin a field" icon="plus" iconOnly>
            <form action={addPinAction.bind(null, ev.id)} className="grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="pin_key">Field</label>
                <select id="pin_key" name="key" className={SELECT_CLASS} defaultValue="">
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

      {/* Keyed on its own columns only (formKey), so it resets only when what it saves changes. */}
      <form key={formKey(PORTAL_LOOK_COLUMNS.map((c) => ev[c]))} action={updatePortalLookAction.bind(null, ev.id)} data-tab-label="Portal look" className="flex flex-col gap-4">
        <div className="grid gap-4 @4xl:grid-cols-2">
          <Section title="Branding and images" hint="Upload the event's images. The logo replaces the initials mark; the banner appears above the home page.">
            <ImageField label="Logo" name="logo" url={ev.logo_url} />
            <ImageField label="Banner" name="banner" url={ev.banner_url} />
          </Section>

          {/* D738: an EN | BM switch on the attendee portal, only with the Language add-on. */}
          {showLanguage && (
            <Section title="Portal language" hint="Only the app's own wording changes. Anything you type for the event shows as you typed it.">
              <label className="flex min-h-11 items-center gap-2 text-sm @xl:col-span-2">
                <input type="checkbox" name="language_switch" defaultChecked={ev.language_switch ?? false} className="size-4 accent-primary" />
                Let attendees switch the portal to Bahasa Malaysia
              </label>
            </Section>
          )}

          {/* D631: the event's colours, Primary among them; posts all seven theme fields on every save. */}
          <ThemeCard className="@4xl:col-span-2" theme={ev.theme ?? EMPTY_THEME} primaryColor={ev.primary_color}
            event={{ name: ev.name, logo_url: ev.logo_url, banner_url: ev.banner_url, starts_on: ev.starts_on, ends_on: ev.ends_on, venue_name: ev.venue_name }} />

          {/* D536: saved with this tab's Save. Stored as what is hidden, so a question added later shows. */}
          <Card className="@4xl:col-span-2">
            <CardHeader>
              <CardTitle>What attendees see on their Me page</CardTitle>
              <CardDescription>
                Their name is always shown. Untick anything you would rather they did not see. A question you add later shows until you untick it here, and a card with nothing left to show disappears.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {meGroups(ev).map((g) => (
                <fieldset key={g.title} className="flex flex-col gap-1">
                  <legend className="mb-1 text-sm font-extrabold">{g.title}</legend>
                  {g.items.map((i) => (
                    <label key={i.key} className="flex min-h-11 items-center gap-2 text-sm">
                      <input type="checkbox" name="me_shown" value={i.key} defaultChecked={!(ev.me_hidden ?? []).includes(i.key)} className="size-4 accent-primary" /> {i.label}
                    </label>
                  ))}
                </fieldset>
              ))}
            </CardContent>
          </Card>
        </div>
        <SaveBar label="Save" note="Saves this tab." unsavedNote="Unsaved changes" />
      </form>

    </>
  );
}
