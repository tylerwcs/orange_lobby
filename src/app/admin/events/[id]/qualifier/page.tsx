import { requireEventAccess } from "@/lib/access";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { eventFeatures, has, NotInEvent } from "@/features/catalogue";
import { getSettings, phaseSubtitle, SettingsCard } from "@/features/qualifier";
import { saveQualifierSettingsAction } from "./actions";

export const metadata = { title: "Typing qualifier" };

// Outside the component, as the display and host pages read their clock: the lint rule for
// render purity does not follow a call into a helper.
const subtitleNow = (s: Awaited<ReturnType<typeof getSettings>>) => phaseSubtitle(s, Date.now());

export default async function Qualifier({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, ev } = await requireEventAccess(id);
  if (!has(await eventFeatures(ev.id), "typing_qualifier")) {
    return <NotInEvent eventId={ev.id} title="Typing qualifier" keys={["typing_qualifier"]} back={`/admin/events/${ev.id}/qualifier`} canTurnOn={actor.kind === "admin"} />;
  }
  const settings = await getSettings(ev.id);
  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title="Typing qualifier" subtitle={subtitleNow(settings)} />
      <SettingsCard settings={settings} action={saveQualifierSettingsAction.bind(null, ev.id)} />
    </div>
  );
}
