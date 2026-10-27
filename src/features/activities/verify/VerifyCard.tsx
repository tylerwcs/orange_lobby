import type { Activity, ActivitySubmission } from "@/lib/types";
import { shortDateTime } from "@/lib/text";
import { isImagePath, verifyFileHref } from "@/lib/file-links";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/admin/Modal";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { RevokeForm } from "../kinds/submission/RevokeForm";

/**
 * D495: one entry on the verifier's page - who, which activity, when, the answers, and the
 * photos inline, since checking proof is the whole job. A live entry has Revoke; a revoked
 * one shows who did it and why instead. D518: a live entry also has Approve, and an approved
 * one says who approved it, with Undo (D521). D735: a revoked one has Undo revoke, and a
 * restored one says who brought it back.
 */
export function VerifyCard({ s, activity, who, together, group, token, credit, reasons, revoke, restore, restored, approved, approve, unapprove }: {
  s: ActivitySubmission;
  activity: Activity;
  who: string;
  /** D531: "With <name>" for a tagged pair. */
  together: string | null;
  group: string | null;
  token: string;
  /** `revokeCredit` for a revoked entry; null for a live one. */
  credit: string | null;
  reasons: string[];
  revoke: (fd: FormData) => Promise<void>;
  restore: () => Promise<void>;
  /** `restoreCredit` for a live entry whose revoke was undone; null otherwise. */
  restored: string | null;
  /** `approveCredit`: "Approved by …" for an approved live entry; null otherwise. */
  approved: string | null;
  approve: () => Promise<void>;
  unapprove: () => Promise<void>;
}) {
  const answered = activity.questions.filter((q) => (s.answers[q.key] ?? "") !== "");
  return (
    <Card className={credit ? "opacity-70" : undefined}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {who}
          {credit && <Badge variant="secondary">Revoked</Badge>}
          {approved && <Badge className="bg-success-soft text-success-strong">Approved</Badge>}
        </CardTitle>
        <CardDescription>{[activity.name, group, shortDateTime(s.created_at)].filter(Boolean).join(" · ")}</CardDescription>
        {together && <CardDescription className="text-xs">{together}</CardDescription>}
        {credit && <CardDescription className="text-xs">{credit}</CardDescription>}
        {approved && <CardDescription className="text-xs">{approved}</CardDescription>}
        {restored && <CardDescription className="text-xs">{restored}</CardDescription>}
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
        {credit && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {/* The dialog closes on the redraw: this button only renders on a revoked card, as Revoke's on a live one (D523). */}
            <Modal title={`Bring back ${who}'s entry?`} hint="It counts again exactly as it was sent, marked approved in your name." trigger="Undo revoke" variant="outline">
              <form action={restore} className="flex justify-end">
                <SubmitButton>Undo revoke</SubmitButton>
              </form>
            </Modal>
          </div>
        )}
        {!credit && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {approved ? (
              <form action={unapprove}>
                <SubmitButton variant="ghost" size="sm">Undo approval</SubmitButton>
              </form>
            ) : (
              <form action={approve}>
                <SubmitButton>Approve</SubmitButton>
              </form>
            )}
            <Modal title={`Revoke ${who}'s entry?`} hint="It stops counting and they can send a new one. They'll see the reason you pick." trigger="Revoke" variant="outline">
              <RevokeForm action={revoke} reasons={reasons} />
            </Modal>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
