import { Footprints } from "lucide-react";
import { signedSubmissionUrl } from "@/lib/db/media";
import { metricKm } from "@/lib/tracker";
import { shortTime } from "@/lib/text";
import type { ActivitySubmission, RegistrationQuestion } from "@/lib/types";
import { EntryPhotos } from "./EntryPhotos";
import type { EditEntry } from "@/components/portal/SubmissionHistory";

/**
 * The photos open in a dialog some time after the page renders, so their signed URLs outlive
 * the 60-second default the history's links use - an hour covers anyone who leaves the page open.
 */
const PHOTO_SECONDS = 60 * 60;

/**
 * D374: the selected day's workouts, oldest first. Each line shows its time, km, the first
 * choice answered (how it was recorded) and the first photo as a thumbnail. A revoked entry
 * stays, faded and not counted (D339), so the attendee can see why their total dropped.
 */
export async function EntryTimeline({ entries, questions, metricKey, unit = "km", empty, addedBy, edit }: {
  entries: ActivitySubmission[];
  questions: RegistrationQuestion[];
  metricKey: string;
  unit?: string;
  empty: string;
  /** D392: "Added by Adrian" on an entry a group member sent for this attendee. */
  addedBy?: (s: ActivitySubmission) => string | null;
  /** D391: the Edit control on an entry the attendee may still change. */
  edit?: EditEntry;
}) {
  if (entries.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const files = questions.filter((q) => q.type === "file");
  const choice = questions.find((q) => q.type === "select");
  return (
    <ol className="flex flex-col">
      {await Promise.all(entries.map(async (s, i) => {
        const revoked = s.status === "revoked";
        // A show_when-hidden file question stores "" (see validateAnswers), so it is skipped.
        const photos = await Promise.all(files.filter((q) => s.answers[q.key]).map(async (q) => ({
          key: q.key,
          label: q.label,
          url: await signedSubmissionUrl(s.answers[q.key], PHOTO_SECONDS),
        })));
        const editor = revoked ? null : edit?.(s, Object.fromEntries(photos.map((p) => [p.key, p.url])), "menu");
        const added = s.submitted_by ? addedBy?.(s) : null;
        const at = shortTime(s.created_at);
        const km = `${metricKm(s, metricKey)} ${unit}`;
        return (
          <li key={s.id} className={`relative flex items-center gap-3 py-3 ${revoked ? "opacity-50" : ""}`}>
            {i < entries.length - 1 && <span aria-hidden className="absolute -bottom-3 left-[21px] top-14 border-l-2 border-dashed border-border" />}
            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center self-start rounded-full bg-primary/10 text-primary">
              <Footprints className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className={`font-extrabold tabular-nums ${revoked ? "line-through" : ""}`}>{km}</div>
              {choice && s.answers[choice.key] && <div className="truncate text-sm text-muted-foreground">{s.answers[choice.key]}</div>}
              <div className="text-xs text-muted-foreground">
                {at}{revoked ? " · Removed by the organiser" : s.edited_at ? " · Updated by the organiser" : s.attendee_edited_at ? " · Edited" : ""}{added ? ` · ${added}` : ""}
              </div>
            </div>
            {photos.length > 0 && <EntryPhotos title={`${km} at ${at}`} photos={photos} />}
            {editor}
          </li>
        );
      }))}
    </ol>
  );
}
