import type { ActivitySubmission } from "@/lib/types";
import { shortDateTime } from "@/lib/text";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { attendeeRevokeLabel } from "../../lib/revoke";
import { t, type Lang } from "@/features/language/client";

/**
 * D500: the attendee's revoked entries, each with why. Shown beside the history, never in it:
 * the history and every count read live rows only (D501), so nothing here can change whether
 * they may submit. `canResend` adds the line that tells them they can.
 */
export function RevokedList({ entries, byline, canResend, lang = "en" }: {
  entries: ActivitySubmission[];
  lang?: Lang;
  byline?: (s: ActivitySubmission) => string | null;
  canResend: boolean;
}) {
  if (entries.length === 0) return null;
  const d = t(lang).submission.revoked;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-extrabold">{d.title}</h2>
      {entries.map((s) => {
        const by = byline?.(s);
        return (
          <Card key={s.id} className="opacity-75">
            <CardHeader>
              <CardTitle className="text-[13px] font-bold text-muted-foreground line-through">{shortDateTime(s.created_at, lang)}</CardTitle>
              <CardDescription className="text-sm text-foreground">{attendeeRevokeLabel(s, "history", lang)}</CardDescription>
              {by && <CardDescription className="text-[11px]">{by}</CardDescription>}
              {canResend && <CardDescription className="text-[11px]">{d.canResend}</CardDescription>}
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
