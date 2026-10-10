import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { appBaseUrl } from "@/lib/links";
import { shortDateTime } from "@/lib/text";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ShareLink } from "@/components/admin/ShareLink";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { eventChecklist, listSetupFiles, listSetupItems, listSetupRows, type SetupFileRow, type SetupItemRow, type SetupRow } from "../db";
import { SECTION_TITLES, setupLink, type SetupSection } from "../sections";
import { sectionStatus, STATUS_LABELS, type SectionStatus } from "../status";
import { formatBytes, ITEM_STATUS_ADMIN, itemStatus, type ItemStatus } from "../hub";
import { createSetupLinkAction, markItemHandledAction, replaceSetupLinkAction, turnOffSetupLinkAction } from "./actions";

const STATUS_VARIANT: Record<SectionStatus, "secondary" | "warning" | "success"> = {
  not_started: "secondary", draft: "secondary", submitted: "warning", applied: "success",
};
const ITEM_VARIANT: Record<ItemStatus, "secondary" | "warning" | "success"> = { empty: "secondary", new: "warning", handled: "success" };

type Entry = { key: string; kind: "step" | "card"; title: string };

/** One checklist item: its title and badges, and under it the step's review link, its files, its note and Mark handled. */
function ItemRow({ eventId, entry, item, files, row }: { eventId: string; entry: Entry; item: SetupItemRow | null; files: SetupFileRow[]; row: SetupRow | null }) {
  const hub = itemStatus(item, files.length);
  const s = entry.kind === "step" ? sectionStatus(row) : null;
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/50">
          <span className="min-w-0 flex-1 text-sm font-bold">{entry.title}</span>
          {files.length > 0 && <span className="text-xs text-muted-foreground">{files.length} file{files.length === 1 ? "" : "s"}</span>}
          {s && <Badge variant={STATUS_VARIANT[s]}>{STATUS_LABELS[s]}</Badge>}
          {(entry.kind === "card" || hub !== "empty") && <Badge variant={ITEM_VARIANT[hub]}>{ITEM_STATUS_ADMIN[hub]}</Badge>}
        </summary>
        <div className="flex flex-col gap-3 px-4 pb-4">
          {s && (
            <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <Link href={`/admin/events/${eventId}/setup/${entry.key}`} className="text-sm font-bold text-primary">Review {SECTION_TITLES[entry.key as SetupSection]} ›</Link>
              <span>{row?.submitted_at ? `Submitted ${shortDateTime(row.submitted_at)}` : "Not submitted"}</span>
              {row?.applied_at && <span>Applied {shortDateTime(row.applied_at)}</span>}
            </p>
          )}
          {files.length > 0 && (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {files.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <a href={`/admin/events/${eventId}/setup/files/${f.id}`} className="min-w-0 flex-1 truncate font-semibold text-primary hover:underline">{f.name}</a>
                  <span className="text-xs text-muted-foreground">{formatBytes(f.size_bytes)} · {shortDateTime(f.uploaded_at)}</span>
                </li>
              ))}
            </ul>
          )}
          {item?.notes.trim() && <p className="whitespace-pre-line rounded-lg bg-muted/50 p-3 text-sm">{item.notes}</p>}
          {hub === "empty" && entry.kind === "card" && <p className="text-sm text-muted-foreground">Nothing sent yet.</p>}
          {hub === "new" && (
            <form action={markItemHandledAction.bind(null, eventId, entry.key)} className="self-start">
              <SubmitButton>Mark handled</SubmitButton>
            </form>
          )}
        </div>
      </details>
    </li>
  );
}

/**
 * The admin's side of the setup link (D448, D458): the link itself, then every checklist item in
 * one table - each step's review, and each item's files and note with Mark handled.
 */
export async function SetupAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [rows, list, items, files] = await Promise.all([listSetupRows(ev.id), eventChecklist(ev), listSetupItems(ev.id), listSetupFiles(ev.id)]);
  const url = ev.setup_token ? setupLink(appBaseUrl(), ev.setup_token) : null;
  // The Setup badge counts every item row, so one whose feature has since been turned off is listed too, after the checklist.
  const onList = new Set(list.map((e) => e.key));
  const gone = [...new Set([...items.map((i) => i.item_key), ...files.map((f) => f.item_key)])].filter((k) => !onList.has(k));
  const entries: Entry[] = [
    ...list,
    ...gone.map((key): Entry => ({ key, kind: "card", title: `${key} (no longer on the checklist)` })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title="Setup" subtitle="What the organiser sends, in one place, waiting for you." />

      <Card>
        <CardHeader>
          <CardTitle>Organiser link</CardTitle>
          <CardDescription>One private link for the organiser&apos;s team: their checklist, the steps they fill in, and the files they send. No login. Nothing they submit changes the event until you apply it.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {url ? (
            <>
              <ShareLink label="Setup" url={url} />
              <div className="flex flex-wrap gap-2">
                <a href={url} target="_blank" rel="noopener" className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-semibold hover:bg-muted">Open as organiser</a>
                <form action={replaceSetupLinkAction.bind(null, ev.id)}>
                  <ConfirmButton message="Replace the setup link? The old one stops working immediately. What the organiser sent is kept.">Replace link</ConfirmButton>
                </form>
                <form action={turnOffSetupLinkAction.bind(null, ev.id)}>
                  <ConfirmButton message="Turn off the setup link? The organiser can't open it until you create a new one. What they sent is kept.">Turn off link</ConfirmButton>
                </form>
              </div>
            </>
          ) : (
            <form action={createSetupLinkAction.bind(null, ev.id)}><SubmitButton>Create setup link</SubmitButton></form>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle>Checklist</CardTitle>
          <CardDescription>Everything the organiser sends, item by item. Open a submitted step to review and apply it. Mark an item handled once you&apos;ve dealt with its files and note; anything new they send flags it again.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y divide-border border-t border-border">
            {entries.map((e) => (
              <ItemRow
                key={e.key}
                eventId={ev.id}
                entry={e}
                item={items.find((i) => i.item_key === e.key) ?? null}
                files={files.filter((f) => f.item_key === e.key)}
                row={e.kind === "step" ? rows.find((r) => r.section === e.key) ?? null : null}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
