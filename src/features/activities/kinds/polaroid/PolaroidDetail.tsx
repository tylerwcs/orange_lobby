import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { formKey } from "@/lib/form-key";
import { listCategories } from "@/lib/db/attendees";
import { appBaseUrl, polaroidWallLink } from "@/lib/links";
import type { Activity, Event } from "@/lib/types";
import { readPolaroidSettings, countByActivity, countLiveByActivity } from "@/features/polaroid";
import { CategoryCombo } from "@/components/admin/AgendaCombos";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Field } from "@/components/admin/Field";
import { SaveBar } from "@/components/admin/SaveBar";
import { OpenSwitch } from "@/components/admin/OpenSwitch";
import { RichTextEditor, SECTIONS_HINT } from "@/components/admin/RichTextEditor";
import { ImageField } from "@/components/admin/ImageField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ActivityMenu } from "../../admin/ActivityMenu";
import { COVER_HINT } from "../../admin/ActivityRows";
import { removeWarning } from "../../row";
import { toggleOpenAction, togglePinAction, savePolaroidActivityAction, deletePolaroidActivityAction, uploadActivityImageAction } from "../../admin/actions";

/** A polaroid wall's page (D485). Task 11 adds the moderation feed, stickers and wall settings. */
export async function PolaroidDetail({ ev, activity }: { ev: Event; activity: Activity; tab?: string; show?: string }) {
  const path = `/admin/events/${ev.id}/activities/${activity.id}`;
  const [categories, live, total] = await Promise.all([listCategories(ev.id), countLiveByActivity(ev.id), countByActivity(activity.id)]);
  const settings = readPolaroidSettings(activity.polaroid);
  const wall = activity.wall_token ? polaroidWallLink(appBaseUrl(), activity.wall_token) : null;
  const onWall = live[activity.id] ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title={activity.name}
        subtitle={`${onWall} polaroid${onWall === 1 ? "" : "s"} on the wall`}
        actions={
          <>
            <OpenSwitch open={activity.is_open} action={toggleOpenAction.bind(null, ev.id, activity.id, "setup")} name={activity.name} showLabel />
            {wall && (
              <Link href={wall} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <ExternalLink data-icon="inline-start" />Open wall
              </Link>
            )}
            <ActivityMenu
              name={activity.name}
              pinned={activity.pinned}
              togglePin={togglePinAction.bind(null, ev.id, activity.id, "setup")}
              settingsHref={path}
              remove={deletePolaroidActivityAction.bind(null, ev.id, activity.id)}
              removeMessage={removeWarning({ kind: "polaroid", polaroids: total })}
            />
          </>
        }
      />
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent>
          <form key={formKey({ ...activity, is_open: undefined })} action={savePolaroidActivityAction.bind(null, ev.id, activity.id)} className="grid grid-cols-1 gap-4">
            <Field label="Name" name="name" defaultValue={activity.name} />
            <Field label="Prompt above the camera" name="prompt" defaultValue={settings.prompt} placeholder="Share the moment!" />
            <RichTextEditor name="description" label="Description (optional)" defaultValue={activity.description} description={SECTIONS_HINT} uploadImage={uploadActivityImageAction.bind(null, ev.id)} />
            <ImageField label="Image (optional)" name="image" url={activity.image_url} description={COVER_HINT} />
            <CategoryCombo categories={categories} defaultValue={activity.categories ?? []} />
            <SaveBar inCard />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
