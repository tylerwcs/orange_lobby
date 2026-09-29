import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees } from "@/lib/db/attendees";
import { listGroups, liveEntryCountsByGroup } from "@/lib/db/groups";
import { eventFields, MAX_ATTENDEE_FIELDS } from "@/lib/attendee-fields";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { RowActions } from "@/components/admin/RowActions";
import { FieldPicker } from "@/components/admin/FieldPicker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { createGroupAction, renameGroupAction, deleteGroupAction, updateGroupFieldsAction } from "./actions";
import { BuildFromColumn } from "./build-from-column";
import { SectionIconForm } from "@/components/admin/SectionIconForm";
import { saveSectionIconAction } from "../actions";
import { sectionIcons } from "@/lib/launcher";

export const metadata = { title: "Groups" };

/**
 * D346: the event's groups, one row each, with the ⋯ menu every admin list has. A group's own
 * page holds its members. Build from column (D347) and the fields members share (D348) sit in
 * the header and below the list.
 */
export default async function Groups({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id } = await params;
  const { from } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [groups, attendees] = await Promise.all([listGroups(ev.id), listAttendees(ev.id)]);
  const counts = new Map<string, number>();
  for (const a of attendees) if (a.group_id) counts.set(a.group_id, (counts.get(a.group_id) ?? 0) + 1);
  const grouped = attendees.filter((a) => a.group_id).length;
  // D349's confirmation names what a delete leaves behind. F5: one query for every group's
  // count, not one query per row.
  const entries = await liveEntryCountsByGroup(ev.id);
  const fields = eventFields(ev.registration_questions, ev.attendee_fields);
  const shared = ev.group_fields.filter((k) => fields.some((f) => f.key === k));

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title="Groups"
        subtitle={`${groups.length} group${groups.length === 1 ? "" : "s"} · ${grouped} of ${attendees.length} attendees grouped`}
        actions={
          <>
            {/* D362: the My group button's picture, set here as Agenda's and Info's are on their pages. */}
            <Modal title="My group icon" hint="The round button group members tap on the portal home." trigger="My group tile settings" icon="settings" iconOnly>
              <SectionIconForm action={saveSectionIconAction.bind(null, ev.id, "group")} section="group" current={sectionIcons(ev.section_icons).group} />
            </Modal>
            <BuildFromColumn eventId={ev.id} fields={[{ key: "category", label: "Category" }, ...fields]} from={from ?? null} attendees={attendees} groups={groups} />
            <Modal title="New group" trigger="New group" icon="plus" variant="default">
              <form action={createGroupAction.bind(null, ev.id)} className="grid gap-3">
                <Field label="Name" name="name" placeholder="Team 1" />
                <SubmitButton>Create group</SubmitButton>
              </form>
            </Modal>
          </>
        }
      />

      <Card className="overflow-hidden">
        <CardContent className="px-0">
          {groups.length === 0 ? (
            <Empty className="border-0 bg-transparent">
              <EmptyHeader>
                <EmptyTitle>No groups yet</EmptyTitle>
                <EmptyDescription>Create one, or build them from a column of the masterlist.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Group</TableHead>
                  <TableHead className="w-32 text-right">Members</TableHead>
                  <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => {
                  const n = counts.get(g.id) ?? 0;
                  const e = entries.get(g.id) ?? 0;
                  return (
                    <TableRow key={g.id}>
                      <TableCell><Link href={`/admin/events/${ev.id}/groups/${g.id}`} className="font-semibold hover:underline">{g.name}</Link></TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{n}</TableCell>
                      <TableCell>
                        <RowActions
                          name={g.name}
                          edit={{
                            title: "Rename group",
                            form: (
                              <form action={renameGroupAction.bind(null, ev.id, g.id)} className="grid gap-3">
                                <Field label="Name" name="name" defaultValue={g.name} />
                                <SubmitButton>Save</SubmitButton>
                              </form>
                            ),
                          }}
                          remove={{
                            action: deleteGroupAction.bind(null, ev.id, g.id),
                            message: `${n} member${n === 1 ? "" : "s"} will have no group.${e ? ` Its ${e} submission${e === 1 ? "" : "s"} stay, under “Deleted group”.` : ""}`,
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
          <CardTitle>Shown to group members</CardTitle>
          <CardDescription>Members always see each other&apos;s names. Pick anything else they should see, like company or phone.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateGroupFieldsAction.bind(null, ev.id)} className="flex flex-col items-start gap-3">
            <FieldPicker key={shared.join("␟")} name="group_fields" label="Fields shown to group members" fields={fields} selected={shared} max={MAX_ATTENDEE_FIELDS} />
            <SubmitButton>Save fields</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
