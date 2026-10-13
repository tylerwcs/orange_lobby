import { appBaseUrl, verifierLink } from "@/lib/links";
import { shortDate } from "@/lib/text";
import type { Event } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { CopyLink } from "@/components/admin/CopyLink";
import { RowActions } from "@/components/admin/RowActions";
import { listVerifierLinks } from "../db/verifiers";
import { reasonsOf, MAX_REASONS } from "../lib/revoke";
import { addVerifierAction, replaceVerifierLinkAction, removeVerifierAction, saveRevokeReasonsAction } from "./verifier-actions";

/**
 * D502: Settings → Verification. Outside the big Settings form, like Committee alerts: each
 * card posts its own small form, so nothing here can blank another tab's fields.
 */
export async function VerificationTab({ ev }: { ev: Event }) {
  const links = await listVerifierLinks(ev.id);
  const base = appBaseUrl();
  const reasons = reasonsOf(ev);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Verifier links</CardTitle>
          <CardDescription>
            Each person gets their own link. It opens this event&apos;s submissions and nothing else: they can look through
            entries and revoke one with a reason. Their revokes carry the name you give here. A link works until you remove or replace it.
          </CardDescription>
          <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
            <Modal title="Add a verifier" hint="Their name is shown to admins on every entry they revoke." trigger="Add verifier" icon="plus">
              <form action={addVerifierAction.bind(null, ev.id)} className="grid gap-4">
                <Field label="Name" name="name" placeholder="Aisyah" />
                <SubmitButton>Make their link</SubmitButton>
              </form>
            </Modal>
          </div>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No verifiers yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((l) => {
                  const url = verifierLink(base, l.token);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-semibold">{l.name}</TableCell>
                      <TableCell><CopyLink link={url} /></TableCell>
                      <TableCell className="text-muted-foreground">{shortDate(l.created_at.slice(0, 10))}</TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          name={l.name}
                          links={[{ label: "Open link", href: url, newTab: true }]}
                          dialog={{
                            label: "Replace link",
                            title: `Replace ${l.name}'s link?`,
                            hint: "The old link stops working at once, including on a page they already have open. Send them the new one.",
                            form: <form action={replaceVerifierLinkAction.bind(null, ev.id, l.id)}><SubmitButton>Replace link</SubmitButton></form>,
                          }}
                          remove={{
                            action: removeVerifierAction.bind(null, ev.id, l.id),
                            label: "Remove",
                            message: "Their link stops working at once. Entries they already revoked stay revoked, and still show their name.",
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revoke reasons</CardTitle>
          <CardDescription>
            What admins and verifiers pick from when they revoke an entry. One per line, up to {MAX_REASONS}, in the order they
            should appear. &ldquo;Other&rdquo;, with their own words, is always offered too. The attendee sees the reason.
            Changing this list never changes what earlier revokes said.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form key={reasons.join("\n")} action={saveRevokeReasonsAction.bind(null, ev.id)} className="flex max-w-xl flex-col items-start gap-3">
            <label htmlFor="revoke_reasons" className="sr-only">Revoke reasons</label>
            <Textarea id="revoke_reasons" name="revoke_reasons" rows={Math.max(6, reasons.length + 1)} defaultValue={reasons.join("\n")} />
            <SubmitButton>Save reasons</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
