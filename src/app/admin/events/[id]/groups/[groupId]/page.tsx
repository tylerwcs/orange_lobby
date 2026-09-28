import Link from "next/link";
import Form from "next/form";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees } from "@/lib/db/attendees";
import { getGroup, groupMembers, listGroups, liveGroupEntryCount } from "@/lib/db/groups";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { RowActions } from "@/components/admin/RowActions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addToGroupAction, removeFromGroupAction, renameGroupAction, deleteGroupAction } from "../actions";

const SEARCH_LIMIT = 20;

/**
 * D346: one group's members, with Remove on each row's ⋯ menu, and a search to add people.
 * Search is a GET (`?q=`), so the page stays a server component; each result posts its own Add.
 */
export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string; groupId: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id, groupId } = await params;
  const { q = "" } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const group = await getGroup(ev.id, groupId);
  if (!group) notFound();
  const [members, groups, found, entries] = await Promise.all([
    groupMembers(ev.id, group.id),
    listGroups(ev.id),
    q.trim() ? listAttendees(ev.id, q.trim()) : Promise.resolve([]),
    liveGroupEntryCount(ev.id, group.id),
  ]);
  const nameOf = new Map(groups.map((g) => [g.id, g.name]));
  const results = found.filter((a) => a.group_id !== group.id).slice(0, SEARCH_LIMIT);
  const base = `/admin/events/${ev.id}/groups/${group.id}`;

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/admin/events/${ev.id}/groups`} className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />Groups
      </Link>
      <AdminHeader
        title={group.name}
        subtitle={`${members.length} member${members.length === 1 ? "" : "s"}`}
        actions={
          <>
            <Modal title="Rename group" trigger="Rename">
              <form action={renameGroupAction.bind(null, ev.id, group.id)} className="grid gap-3">
                <input type="hidden" name="back" value="detail" />
                <Field label="Name" name="name" defaultValue={group.name} />
                <SubmitButton>Save</SubmitButton>
              </form>
            </Modal>
            <RowActions
              name={group.name}
              remove={{
                action: deleteGroupAction.bind(null, ev.id, group.id),
                message: `${members.length} member${members.length === 1 ? "" : "s"} will have no group.${entries ? ` Its ${entries} submission${entries === 1 ? "" : "s"} stay, under “Deleted group”.` : ""}`,
              }}
            />
          </>
        }
      />

      <Card>
        <CardHeader><CardTitle>Add people</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Form action={base} className="flex gap-2">
            <input name="q" defaultValue={q} placeholder="Search by name or email" aria-label="Search attendees"
              className="h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
            <SubmitButton variant="outline">Search</SubmitButton>
          </Form>
          {q.trim() && results.length === 0 && <p className="text-sm text-muted-foreground">No one else matches “{q}”.</p>}
          {results.length > 0 && (
            <ul className="divide-y rounded-md border">
              {results.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>
                    <span className="font-semibold">{a.name}</span>
                    {a.group_id && <span className="text-muted-foreground"> · now in {nameOf.get(a.group_id) ?? "another group"}</span>}
                  </span>
                  <form action={addToGroupAction.bind(null, ev.id, group.id)}>
                    <input type="hidden" name="ids" value={a.id} />
                    <SubmitButton variant="outline" size="sm">{a.group_id ? "Move here" : "Add"}</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Members · {members.length}</CardTitle></CardHeader>
        <CardContent className="px-0">
          {members.length === 0 ? (
            <p className="px-6 pb-2 text-sm text-muted-foreground">No members yet. Search above to add people.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-semibold">{m.name}</TableCell>
                    <TableCell className="text-muted-foreground">{m.email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{m.category ?? "—"}</TableCell>
                    <TableCell>
                      <RowActions name={m.name} remove={{ action: removeFromGroupAction.bind(null, ev.id, group.id, m.id), label: "Remove from group", message: `${m.name} will have no group. Anything they already submitted stays with ${group.name}.` }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
