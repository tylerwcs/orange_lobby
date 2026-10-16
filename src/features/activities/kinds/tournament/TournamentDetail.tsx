import Link from "next/link";
import { Download } from "lucide-react";
import { formKey } from "@/lib/form-key";
import { listCategories } from "@/lib/db/attendees";
import { listGroups } from "@/lib/db/groups";
import { eventFields } from "@/lib/attendee-fields";
import type { Activity, Event } from "@/lib/types";
import { countedRows, isLocked, listSports, shortCount, squadPeople, squadRows, SportsPanel, SquadsPanel } from "@/features/tournaments";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SaveBar } from "@/components/admin/SaveBar";
import { OpenSwitch } from "@/components/admin/OpenSwitch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ScheduleOpen } from "../../admin/ScheduleOpen";
import { ActivityMenu } from "../../admin/ActivityMenu";
import { ActivityTabs } from "../../admin/ActivityTabs";
import { activityTabs, resolveTab, activityHref, type ActivityTab } from "../../tabs";
import { removeWarning } from "../../row";
import { opensLabel } from "../../lib/schedule";
import { toggleOpenAction, scheduleOpenAction, removeScheduleAction, togglePinAction, saveTournamentActivityAction, deleteTournamentActivityAction, uploadActivityImageAction } from "../../admin/actions";
import { TournamentSetupFields } from "./TournamentSetupFields";

/** A tournament's page (D648): Setup holds its details and squad rules; Squads and Sports are their own tabs. */
export async function TournamentDetail({ ev, activity, tab, sport }: { ev: Event; activity: Activity; tab?: string; sport?: string }) {
  const path = `/admin/events/${ev.id}/activities/${activity.id}`;
  const [categories, groups, sports, rows] = await Promise.all([listCategories(ev.id), listGroups(ev.id), listSports(activity.id), squadRows(activity.id)]);
  const counted = countedRows(rows, await squadPeople(ev.id, rows.map((r) => r.attendee_id)));
  const groupIds = groups.map((g) => g.id);
  const short = sports.reduce((n, s) => n + shortCount(s, groupIds, counted), 0);
  const locked = isLocked(activity.squads_close_at, new Date());
  const tabs = activityTabs("tournament", { shortSquads: short });
  const current = resolveTab(tabs, tab);
  const href = (t: ActivityTab) => activityHref(ev.id, activity.id, t);
  const subtitle = activity.squads_close_at ? `Squads ${locked ? "locked" : "lock"} ${opensLabel(activity.squads_close_at)}` : "No squad deadline";
  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title={activity.name}
        subtitle={subtitle}
        actions={
          <>
            <ScheduleOpen
              activity={activity}
              schedule={scheduleOpenAction.bind(null, ev.id, activity.id, "setup")}
              remove={removeScheduleAction.bind(null, ev.id, activity.id, "setup")}
            />
            <OpenSwitch open={activity.is_open} action={toggleOpenAction.bind(null, ev.id, activity.id, "setup", !activity.is_open)} name={activity.name} showLabel />
            <Link href={`/admin/events/${ev.id}/export/squads.xlsx?activity=${activity.id}`} prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Download data-icon="inline-start" />Export squads
            </Link>
            <ActivityMenu
              name={activity.name}
              pinned={activity.pinned}
              togglePin={togglePinAction.bind(null, ev.id, activity.id, "setup")}
              settingsHref={path}
              remove={deleteTournamentActivityAction.bind(null, ev.id, activity.id)}
              removeMessage={removeWarning({ kind: "tournament", sports: sports.length, players: counted.length })}
            />
          </>
        }
      />
      <ActivityTabs tabs={tabs} current={current} href={href} />
      {current === "squads" && <SquadsPanel ev={ev} activity={activity} sportId={sport} />}
      {current === "sports" && <SportsPanel ev={ev} activity={activity} />}
      {current === "setup" && (
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent>
            <form key={formKey({ ...activity, is_open: undefined })} action={saveTournamentActivityAction.bind(null, ev.id, activity.id)} className="grid grid-cols-1 gap-4">
              <TournamentSetupFields activity={activity} categories={categories} fields={eventFields(ev.registration_questions, ev.attendee_fields)} uploadImage={uploadActivityImageAction.bind(null, ev.id)} />
              <SaveBar inCard />
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
