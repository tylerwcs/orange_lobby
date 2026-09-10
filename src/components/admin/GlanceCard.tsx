import { Card, buttonClass } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Badge } from "@/components/ui/Badge";

export function GlanceCard({ registered, checkedIn, walkIns, registrationOpen, registrationHint, eventId }: {
  registered: number; checkedIn: number; walkIns: number;
  registrationOpen: boolean; registrationHint?: string; eventId: string;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="text-[17px] font-extrabold">At a glance</h2>
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Checked in" value={checkedIn} icon="check" tint="ok" />
        <StatTile label="Registered" value={registered} icon="users" tint="pink" />
        <StatTile label="Walk-ins" value={walkIns} icon="scan" tint="brand" />
        <StatTile label="Not yet in" value={Math.max(0, registered - checkedIn)} icon="clock" tint="slate" />
      </div>
      <div className="mt-auto flex flex-col gap-2.5 border-t border-line pt-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Registration</h3>
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone={registrationOpen ? "ok" : "neutral"} dot={registrationOpen}>{registrationOpen ? "Open" : "Closed"}</Badge>
          {registrationHint && <span className="text-xs font-semibold text-muted">{registrationHint}</span>}
        </div>
        <a href={`/admin/events/${eventId}/settings`} className={`${buttonClass("secondary")} self-start`}>Registration settings</a>
      </div>
    </Card>
  );
}
