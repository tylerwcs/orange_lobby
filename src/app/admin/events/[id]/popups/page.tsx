import { requireEventAccess } from "@/lib/access";
import { eventFeatures, has, NotInEvent } from "@/features/catalogue";
import { PopupsPage } from "@/features/popups";

export const metadata = { title: "Popups" };

export default async function PopupsAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, ev } = await requireEventAccess(id);
  if (!has(await eventFeatures(ev.id), "popups")) {
    return <NotInEvent eventId={ev.id} title="Popups" keys={["popups"]} back={`/admin/events/${ev.id}/popups`} canTurnOn={actor.kind === "admin"} />;
  }
  return <PopupsPage eventId={ev.id} />;
}
