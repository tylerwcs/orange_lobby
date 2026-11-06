import { formKey } from "@/lib/form-key";
import { isoToLocalInput } from "@/lib/time";
import { MAX_QUESTIONS } from "@/lib/questions-form";
import { editorQuestions, STANDARD_COUNT, STANDARD_RULES } from "@/lib/registration-standard";
import { DEFAULT_REGISTRATION_INTRO, REGISTRATION_QUESTION_TYPES } from "@/lib/registration";
import { DEFAULT_DONE_TITLE, DEFAULT_DONE_MESSAGE_DOOR, DEFAULT_DONE_MESSAGE_NO_DOOR, showsDoneQr } from "@/lib/registration-done";
import { REGISTRATION_COLUMNS } from "@/lib/settings-form";
import { sanitizeHtml } from "@/lib/sanitize";
import type { Activity, Event } from "@/lib/types";
import { KIND_META } from "@/features/activities/client";
import { SELECT_CLASS } from "./styles";
import { QUEUE_COPY_DEFAULTS } from "@/features/registration-queue";
import { Field } from "@/components/admin/Field";
import { ImageField } from "@/components/admin/ImageField";
import { QuestionCards } from "@/components/admin/QuestionCards";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { SaveBar } from "@/components/admin/SaveBar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateRegistrationAction } from "../../actions";

/**
 * D778: the registration form and everything around it, one form saving only these columns.
 * `taken` and `queued` (D686) are how full it is, shown under the limit.
 */
export function RegistrationTab({ ev, taken, queued, activities, whatsappOn }: {
  ev: Event; taken: string | null; queued: string;
  /** D805: what the next step can be - every activity of the event. */
  activities: Activity[];
  /** D838: the event has WhatsApp turned on, so its link can go out on registering. */
  whatsappOn: boolean;
}) {
  const qs = editorQuestions(ev.registration_form);
  // Keyed on its own columns only. The editor works from the full form (registration_form), so that
  // stands in for the answer-only registration_questions.
  const key = formKey([...REGISTRATION_COLUMNS.filter((c) => c !== "registration_questions").map((c) => ev[c]), ev.registration_form]);
  return (
    <form key={key} action={updateRegistrationAction.bind(null, ev.id)} data-tab-label="Registration" className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Registration</CardTitle>
          <CardDescription>When the form is open, and what it asks.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
        <div className="grid gap-4 @xl:grid-cols-2">
          <label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" name="registration_open" defaultChecked={ev.registration_open} className="size-4 accent-primary" /> Registration is open</label>
          <Field label="Closes automatically at" name="registration_closes_at" type="datetime-local" defaultValue={isoToLocalInput(ev.registration_closes_at)} />
          {/* D677, D686: only people who register through the form count; imported and added people never do. */}
          <Field label="Limit registrations to" name="registration_limit" type="number" defaultValue={ev.registration_limit ? String(ev.registration_limit) : ""}
            description={[taken ? `${taken}.` : "Leave blank for no limit.", queued ? `${queued}.` : "", "When it is full, people can join a waiting list and move in as places free up."].filter(Boolean).join(" ")} />
          {/* D696 */}
          <div className="flex flex-col gap-1">
            <label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" name="registration_needs_approval" defaultChecked={ev.registration_needs_approval ?? false} className="size-4 accent-primary" /> Registrations need approval</label>
            <p className="text-sm text-muted-foreground">Each new registration waits under Attendees → Pending approval, holding a place, until you approve or decline it.</p>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" name="self_cancel" defaultChecked={ev.self_cancel} className="size-4 accent-primary" /> Attendees can cancel their own registration</label>
          <Field label="Cancelling closes at" name="self_cancel_closes_at" type="datetime-local" defaultValue={isoToLocalInput(ev.self_cancel_closes_at)} description="Leave blank to allow it until the event is archived." />
          <div className="@xl:col-span-2">
            <Field label="Line above the form" name="registration_intro" defaultValue={ev.registration_intro ?? ""} placeholder={DEFAULT_REGISTRATION_INTRO} description="Leave blank to use the placeholder text." />
          </div>
          {/* D618: the registration page's own banner. The colours live in the event theme (D625). */}
          <ImageField label="Banner above the form" name="registration_banner" url={ev.registration_banner_url}
            description="Shown on the registration page just under the event name bar, as wide as the page and at the image's own height - nothing is cropped." />
          {/* D720: a client's disclaimer or sponsor strip, at the foot of the same page. */}
          <ImageField label="Image under the form" name="registration_footer" url={ev.registration_footer_url}
            description="Shown at the bottom of the registration page, such as a client's disclaimer - as wide as the page and at the image's own height." />
        </div>
        <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-extrabold">Questions</h3>
        <p className="text-xs text-muted-foreground">Name, email, mobile and department are always asked: move them or change their wording and help text, but they can&rsquo;t be removed. Add up to {MAX_QUESTIONS} more. &ldquo;Show only when&rdquo; hides a question until another answer contains the phrase, for example show &ldquo;Room partner&rdquo; only when &ldquo;stay_overnight&rdquo; contains &ldquo;Twin&rdquo;.</p>
        </div>
        <QuestionCards questions={qs} types={REGISTRATION_QUESTION_TYPES} max={MAX_QUESTIONS + STANDARD_COUNT} standard={STANDARD_RULES} />
        {/* D540: a client's own clauses, shown under the questions with a tick of their own (D541). */}
        <RichTextEditor
          name="registration_terms"
          label="Event terms (optional)"
          defaultValue={sanitizeHtml(ev.registration_terms ?? "")}
          description="Your client's own clauses, such as photo consent or no-show charges. Shown under the questions with a tick invitees must agree to, next to the Privacy Notice tick. Leave empty for no terms."
          minHeight={140}
        />
        </CardContent>
      </Card>
      {/* D537, D634, D804, D805: everything about landing after Register in one place - the page,
          its QR, its words, and the activity offered next (which used to be a tick on the booking). */}
      <Card>
        <CardHeader>
          <CardTitle>After they register</CardTitle>
          <CardDescription>
            Where people go once they register, and what they see there. Write {"{name}"} for their first name. Leave the heading or message blank to use the placeholder text.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* D634: off by default - registering lands straight on their event page. */}
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input type="checkbox" name="registration_done_page" defaultChecked={ev.registration_done_page ?? false} className="mt-0.5 size-4 accent-primary" />
            <span>
              <span className="font-bold">Show a confirmation page</span>
              <span className="block text-muted-foreground">Off: they go straight to their event page, or to the next step below. On: they see this page first, with the heading and message below.</span>
            </span>
          </label>
          {/* D804: only with check-in on (no door, no code). Off, the switch keeps its value. */}
          {ev.check_in_enabled ? (
            <label className="flex min-h-11 items-start gap-2 text-sm">
              <input type="checkbox" name="registration_done_qr" defaultChecked={ev.registration_done_qr ?? true} className="mt-0.5 size-4 accent-primary" />
              <span>
                <span className="font-bold">Show their QR code on it</span>
                <span className="block text-muted-foreground">The code crew scan at the door. It is on their event page either way.</span>
              </span>
            </label>
          ) : (
            <input type="hidden" name="registration_done_qr" value={ev.registration_done_qr === false ? "" : "on"} />
          )}
          {/* D838: only with WhatsApp turned on for the event. Off, the switch keeps its value. */}
          {whatsappOn ? (
            <label className="flex min-h-11 items-start gap-2 text-sm">
              <input type="checkbox" name="whatsapp_on_register" defaultChecked={ev.whatsapp_on_register ?? false} className="mt-0.5 size-4 accent-primary" />
              <span>
                <span className="font-bold">WhatsApp them their event link</span>
                <span className="block text-muted-foreground">Sends ecphub_portal as soon as they register, once each. People on the waiting list or awaiting approval get theirs when they are let in.</span>
              </span>
            </label>
          ) : (
            <input type="hidden" name="whatsapp_on_register" value={ev.whatsapp_on_register ? "on" : ""} />
          )}
          <Field label="Heading" name="registration_done_title" defaultValue={ev.registration_done_title ?? ""} placeholder={DEFAULT_DONE_TITLE} />
          <Field
            label="Message"
            name="registration_done_message"
            textarea
            defaultValue={ev.registration_done_message ?? ""}
            placeholder={showsDoneQr(ev) ? DEFAULT_DONE_MESSAGE_DOOR : DEFAULT_DONE_MESSAGE_NO_DOOR}
            description={showsDoneQr(ev)
              ? "Shown under their QR code. Line breaks are kept."
              : "Shown under the heading. Line breaks are kept."}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="after_register_activity_id" className="text-sm font-bold">Next step (optional)</label>
            <select id="after_register_activity_id" name="after_register_activity_id" className={SELECT_CLASS} defaultValue={ev.after_register_activity_id ?? ""}>
              <option value="">None</option>
              {activities.map((a) => <option key={a.id} value={a.id}>{a.name} · {KIND_META[a.kind].label}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">
              An activity to do right after registering. With the page on, it shows there as One more step; with it off, they go straight to it. Only while they can do it (open, for their group, a seat left or not sent yet); otherwise they land as usual.
            </p>
          </div>
        </CardContent>
      </Card>
      {/* D708: shown always, so the wording can be ready before a limit or approval is switched on. */}
      <Card>
        <CardHeader>
          <CardTitle>Waiting list</CardTitle>
          <CardDescription>
            What people see when registration is full, while they wait, and while their registration waits for your approval. Leave any field blank to use the placeholder text.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-extrabold">Registration is full</h3>
            <Field label="Heading" name="registration_full_title" defaultValue={ev.registration_full_title ?? ""} placeholder={QUEUE_COPY_DEFAULTS.fullTitle} />
            <Field label="Message" name="registration_full_message" textarea defaultValue={ev.registration_full_message ?? ""} placeholder={QUEUE_COPY_DEFAULTS.fullMessage}
              description="On the registration link once it is full, above the Join the waiting list button. Line breaks are kept." />
          </div>
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-extrabold">On the waiting list</h3>
            <Field label="Heading" name="registration_waiting_title" defaultValue={ev.registration_waiting_title ?? ""} placeholder={QUEUE_COPY_DEFAULTS.waitingTitle} />
            <Field label="Message" name="registration_waiting_message" textarea defaultValue={ev.registration_waiting_message ?? ""} placeholder={QUEUE_COPY_DEFAULTS.waitingMessage}
              description="On their own link while they wait, under the event name. Line breaks are kept." />
          </div>
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-extrabold">Waiting for approval</h3>
            <Field label="Heading" name="registration_pending_title" defaultValue={ev.registration_pending_title ?? ""} placeholder={QUEUE_COPY_DEFAULTS.pendingTitle} />
            <Field label="Message" name="registration_pending_message" textarea defaultValue={ev.registration_pending_message ?? ""} placeholder={QUEUE_COPY_DEFAULTS.pendingMessage}
              description="On their own link while you decide, when Registrations need approval is on. Line breaks are kept." />
          </div>
        </CardContent>
      </Card>
      <SaveBar label="Save" note="Saves this tab." unsavedNote="Unsaved changes" />
    </form>
  );
}
