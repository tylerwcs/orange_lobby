import { ShieldCheck } from "lucide-react";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { TITLE_INK } from "@/lib/ink";
import { EventTermsPanel } from "@/components/portal/EventTermsPanel";
import { PRIVACY_CONTACT, PRIVACY_MS_PATH, PRIVACY_PATH, TERMS_FIELD } from "@/lib/privacy";
import type { Event } from "@/lib/types";

/**
 * Shown in place of the portal until the attendee agrees to the Privacy Notice (D410).
 *
 * Anyone who registered themselves agreed on the form. Everyone else — the masterlist import,
 * a walk-in, an admin's addition — first meets the app here, through their personal link, so
 * this is where PDPA's notice is given and consent had. Once only: the agreement is stored on
 * the attendee. A plain form post, so it works before JavaScript arrives.
 *
 * There is no "I do not agree" button: declining is not something the portal can act on, since
 * the host already holds the details. It is a request to the team, so the screen says where to
 * send it.
 *
 * D544: an event with terms asks for them here too, with the registration form's own tick, of
 * anyone the form never asked (`portalAsks`). Someone who already consented sees the terms alone.
 */
export function ConsentGate({ event, consent = true, termsHtml = null, agree }: {
  event: Pick<Event, "name" | "logo_url" | "starts_on" | "ends_on" | "venue_name" | "primary_color">;
  /** Whether the Privacy Notice is still to be agreed (D410). */
  consent?: boolean;
  /** The event's terms when they are still to be agreed, already sanitised. Null: not asked. */
  termsHtml?: string | null;
  agree: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <PortalHeader event={event} />
      <main className="flex-1 px-4 py-4">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <span className="flex size-11 items-center justify-center rounded-full bg-accent text-primary"><ShieldCheck aria-hidden className="size-6" /></span>
            <div>
              <h1 className={`text-xl font-extrabold leading-tight ${TITLE_INK}`}>Before you continue</h1>
              <p className="mt-1 text-sm text-muted-foreground">This is your personal page for {event.name}.</p>
            </div>
            {consent && (
              <>
                <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
                  <li>We hold your name, contact details and the answers you or your organiser gave us, to run this event: your badge, seat, agenda and activities.</li>
                  <li>Your event organiser sees them too. We do not sell them or use them for advertising.</li>
                  <li>They are deleted within twelve months of the event.</li>
                  <li>Anyone with this page&apos;s link can open it, so please don&apos;t share it.</li>
                </ul>
                <p className="text-sm">
                  The full details are in our{" "}
                  <a href={PRIVACY_PATH} target="_blank" rel="noopener" className="font-bold text-primary underline underline-offset-4">Privacy Notice</a>{" "}
                  (<a href={PRIVACY_MS_PATH} lang="ms" hrefLang="ms" target="_blank" rel="noopener" className="font-bold text-primary underline underline-offset-4">Bahasa Malaysia</a>).
                </p>
                {/* D413: the same summary in Bahasa Malaysia, folded so the English reader is not made
                    to scroll past it. <details> opens without JavaScript, like the form below. */}
                <details lang="ms" className="group rounded-lg border border-border px-4 py-3 text-sm">
                  <summary className="cursor-pointer font-bold text-primary marker:text-primary">Baca dalam Bahasa Malaysia</summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <p className="font-bold">Sebelum anda teruskan</p>
                    <p className="text-muted-foreground">Ini ialah halaman peribadi anda untuk {event.name}.</p>
                    <ul className="flex list-disc flex-col gap-2 pl-5 leading-relaxed">
                      <li>Kami menyimpan nama, butiran hubungan dan jawapan yang diberikan oleh anda atau penganjur anda, untuk mengendalikan acara ini: lencana, tempat duduk, agenda dan aktiviti anda.</li>
                      <li>Penganjur acara anda juga melihatnya. Kami tidak menjualnya atau menggunakannya untuk pengiklanan.</li>
                      <li>Ia dipadamkan dalam tempoh dua belas bulan selepas acara.</li>
                      <li>Sesiapa yang mempunyai pautan halaman ini boleh membukanya, jadi sila jangan kongsikannya.</li>
                    </ul>
                    <p>
                      Butiran penuh terdapat dalam{" "}
                      <a href={PRIVACY_MS_PATH} hrefLang="ms" target="_blank" rel="noopener" className="font-bold text-primary underline underline-offset-4">Notis Privasi</a> kami.
                      Tidak bersetuju? E-mel{" "}
                      <a href={`mailto:${PRIVACY_CONTACT}`} className="font-medium underline underline-offset-4">{PRIVACY_CONTACT}</a>{" "}
                      dan kami akan membuang butiran anda.
                    </p>
                  </div>
                </details>
              </>
            )}
            {termsHtml && (
              <div className="flex flex-col gap-2">
                {consent
                  ? <h2 className="text-sm font-extrabold">Event terms</h2>
                  : <p className="text-sm">The organiser has terms for this event. Please read them and tick the box to carry on.</p>}
                <EventTermsPanel html={termsHtml} />
              </div>
            )}
            <form action={agree} className="flex flex-col gap-4">
              {/* A native required checkbox, as on the form: it posts "yes" only when ticked, and
                  the browser asks before the button does anything. */}
              {termsHtml && (
                <label className="flex items-start gap-3 text-sm leading-snug">
                  <input name={TERMS_FIELD} type="checkbox" value="yes" required className="mt-0.5 size-5 shrink-0 accent-primary" />
                  I have read and agree to the event terms above.
                </label>
              )}
              <SubmitButton className="h-12 w-full text-base font-bold">
                {consent ? <>I agree · <span lang="ms">Saya setuju</span></> : "Continue"}
              </SubmitButton>
            </form>
            {consent ? (
              <p className="text-xs text-muted-foreground">
                Don&apos;t agree? Email{" "}
                <a href={`mailto:${PRIVACY_CONTACT}`} className="font-medium underline underline-offset-4">{PRIVACY_CONTACT}</a>{" "}
                and we will remove your details.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Questions about these terms? Ask your event organiser.</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
