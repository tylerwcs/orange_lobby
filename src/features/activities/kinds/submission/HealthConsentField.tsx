import { HeartPulse } from "lucide-react";
import { HEALTH_CONSENT_FIELD, PRIVACY_MS_PATH, PRIVACY_PATH } from "@/lib/privacy";

const link = "font-bold text-primary underline underline-offset-4";

/**
 * D412: the explicit consent a health-data activity asks for, at the top of its submit (or edit)
 * form until the attendee has given it once. PDPA's sensitive personal data needs consent that
 * is specific and separate from the Privacy Notice's, so this names what it covers and stands
 * apart from the questions. A native required checkbox, posting "yes" only when ticked, so it
 * works before JavaScript arrives; the action checks it again regardless.
 *
 * In English and Bahasa Malaysia together (D413): it is the moment consent is given, and the
 * Act wants the notice in both.
 */
export function HealthConsentField({ id }: { id: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-accent/50 p-4">
      <div className="flex items-center gap-2 text-sm font-extrabold">
        <HeartPulse aria-hidden className="size-4 text-primary" />
        <span>Health information <span lang="ms" className="font-semibold text-muted-foreground">· Maklumat kesihatan</span></span>
      </div>
      <div className="flex items-start gap-3">
        <input id={id} name={HEALTH_CONSENT_FIELD} type="checkbox" value="yes" required className="mt-0.5 size-5 shrink-0 accent-primary" />
        <label htmlFor={id} className="flex flex-col gap-2 text-sm leading-snug">
          <span>
            This activity asks for health information, such as InBody results. I give my explicit consent for it to be
            collected and used for this activity only, as set out in the{" "}
            <a href={PRIVACY_PATH} target="_blank" rel="noopener" className={link}>Privacy Notice</a>.
          </span>
          <span lang="ms" className="text-muted-foreground">
            Aktiviti ini meminta maklumat kesihatan, seperti keputusan InBody. Saya memberikan persetujuan nyata saya
            agar maklumat itu dikumpul dan digunakan untuk aktiviti ini sahaja, seperti yang dinyatakan dalam{" "}
            <a href={PRIVACY_MS_PATH} hrefLang="ms" target="_blank" rel="noopener" className={link}>Notis Privasi</a>.
          </span>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">You&apos;re asked once for this activity. · <span lang="ms">Anda hanya ditanya sekali bagi aktiviti ini.</span></p>
    </div>
  );
}
