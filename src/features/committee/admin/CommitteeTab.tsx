import { appBaseUrl, joinLink } from "@/lib/links";
import type { Event } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { CopyLink } from "@/components/admin/CopyLink";
import { RowActions } from "@/components/admin/RowActions";
import { listMembers } from "../db";
import { linkIsLive, memberStatus, LINK_LIFETIME } from "../lib/rules";
import { addMemberAction, newSetupLinkAction, resetLinkAction, removeMemberAction } from "./actions";

/**
 * D563: Settings → Committee, Ecopia admins only. Outside the big Settings form: each control
 * posts its own small form. The Settings page renders this only for an admin.
 */
export async function CommitteeTab({ ev }: { ev: Event }) {
  const members = await listMembers(ev.id);
  const base = appBaseUrl();
  const now = new Date();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Committee</CardTitle>
        <CardDescription>
          People from the client who run this event with you. Each gets their own login and sees this event only — everything
          inside it, except Features, Address, this list, archiving and deleting, which stay with the Ecopia team.
          Their access ends when the event is archived.
        </CardDescription>
        <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
          <Modal title="Add a committee member" hint={`You'll get a one-time link to send them. It works for ${LINK_LIFETIME}.`} trigger="Add member" icon="plus">
            <form action={addMemberAction.bind(null, ev.id)} className="grid gap-4">
              <Field label="Name" name="name" placeholder="Aisyah Rahman" />
              <Field label="Email" name="email" type="email" placeholder="aisyah@client.com" description="They sign in with this. If they're on another event's committee, use the same email." />
              <SubmitButton>Make their link</SubmitButton>
            </form>
          </Modal>
        </div>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No committee members yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Link</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const live = linkIsLive(m, now);
                const url = live && m.link_token ? joinLink(base, m.link_token) : null;
                // A login that was deleted leaves accepted_at behind with no user: it needs a set-up link again.
                const setUp = Boolean(m.user_id);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-semibold">{m.name}</TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                    <TableCell>{memberStatus(m, now)}</TableCell>
                    <TableCell>{url ? <CopyLink link={url} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        name={m.name}
                        dialog={setUp ? {
                          label: "Password reset link",
                          title: `Make a password reset link for ${m.name}?`,
                          hint: `It works once, for ${LINK_LIFETIME}. Their new password applies to every event they're on.`,
                          form: <form action={resetLinkAction.bind(null, ev.id, m.id)}><SubmitButton>Make reset link</SubmitButton></form>,
                        } : {
                          label: "New set-up link",
                          title: `Make a new set-up link for ${m.name}?`,
                          hint: "The old link stops working at once. Send them the new one.",
                          form: <form action={newSetupLinkAction.bind(null, ev.id, m.id)}><SubmitButton>Make new link</SubmitButton></form>,
                        }}
                        remove={{
                          action: removeMemberAction.bind(null, ev.id, m.id),
                          label: "Remove",
                          message: "Their access to this event stops at once, and any link they haven't used stops working. Things they did stay credited to them.",
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
  );
}
