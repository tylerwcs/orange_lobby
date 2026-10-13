import type { Activity, ActivitySubmission } from "@/lib/types";
import { shortDateTime } from "@/lib/text";
import { isImagePath, verifyFileHref } from "@/lib/file-links";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/admin/Modal";
import { RevokeForm } from "../kinds/submission/RevokeForm";

/**
 * D495: one entry on the verifier's page - who, which activity, when, the answers, and the
 * photos inline, since checking proof is the whole job. A live entry has Revoke; a revoked
 * one shows who did it and why instead.
 */
export function VerifyCard({ s, activity, who, group, token, credit, reasons, revoke }: {
  s: ActivitySubmission;
  activity: Activity;
  who: string;
  group: string | null;
  token: string;
  /** `revokeCredit` for a revoked entry; null for a live one. */
  credit: string | null;
  reasons: string[];
  revoke: (fd: FormData) => Promise<void>;
}) {
  const answered = activity.questions.filter((q) => (s.answers[q.key] ?? "") !== "");
  return (
    <Card className={credit ? "opacity-70" : undefined}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {who}
          {credit && <Badge variant="secondary">Revoked</Badge>}
        </CardTitle>
        <CardDescription>{[activity.name, group, shortDateTime(s.created_at)].filter(Boolean).join(" · ")}</CardDescription>
        {credit && <CardDescription className="text-xs">{credit}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {answered.map((q) => {
          const value = s.answers[q.key];
          if (q.type !== "file") {
            return <div key={q.key} className="text-sm"><span className="font-bold">{q.label}: </span><span className="text-muted-foreground">{value}</span></div>;
          }
          const href = verifyFileHref(token, s.id, q.key);
          return (
            <div key={q.key} className="flex flex-col gap-1 text-sm">
              <span className="font-bold">{q.label}</span>
              {isImagePath(value) ? (
                <a href={href} target="_blank" rel="noreferrer" className="block w-fit overflow-hidden rounded-md border">
                  {/* The route redirects to a one-minute signed URL; a plain img follows it. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={href} alt={q.label} loading="lazy" className="max-h-72 w-auto object-contain" />
                </a>
              ) : (
                <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">View file</a>
              )}
            </div>
          );
        })}
        {!credit && (
          <div className="pt-1">
            <Modal title={`Revoke ${who}'s entry?`} hint="It stops counting and they can send a new one. They'll see the reason you pick." trigger="Revoke" variant="outline">
              <RevokeForm action={revoke} reasons={reasons} />
            </Modal>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
