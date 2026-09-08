import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { addCheckpointAction, deleteCheckpointAction } from "../actions";

export const metadata = { title: "Checkpoints · Orange Lobby" };

export default async function CheckpointsAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const cps = await listCheckpoints(ev.id);
  return (
    <div className="max-w-md space-y-6">
      <h1 className="mb-4 text-2xl font-extrabold">Checkpoints</h1>
      <ul className="divide-y rounded-[var(--radius-card)] border border-line bg-surface text-sm">
        {cps.map((c) => (
          <li key={c.id} className="flex justify-between p-3"><span>{c.name}</span>
            <form action={deleteCheckpointAction.bind(null, ev.id, c.id)}><ConfirmButton message="Delete checkpoint and its check-ins?">Delete</ConfirmButton></form></li>
        ))}
        {cps.length === 0 && <li className="p-3 text-muted">No checkpoints. Add &quot;Day 1&quot; and &quot;Day 2&quot;.</li>}
      </ul>
      <form action={addCheckpointAction.bind(null, ev.id)} className="space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <Field label="Name" name="name" placeholder="Day 1" /><Field label="Position in the list (lower first)" name="sort_order" type="number" defaultValue="0" />
        <SubmitButton>Add</SubmitButton>
      </form>
    </div>
  );
}
