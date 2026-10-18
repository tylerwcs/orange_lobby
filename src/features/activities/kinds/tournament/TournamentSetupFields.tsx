import { isoToLocalInput } from "@/lib/time";
import type { Activity } from "@/lib/types";
import type { AttendeeField } from "@/lib/attendee-fields";
import { CategoryCombo } from "@/components/admin/AgendaCombos";
import { Field } from "@/components/admin/Field";
import { RichTextEditor, SECTIONS_HINT, type UploadImage } from "@/components/admin/RichTextEditor";
import { ImageField } from "@/components/admin/ImageField";
import { COVER_HINT } from "../../admin/ActivityRows";

const input = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Nobody on the portal can fill a squad (D640): captains pick, and no field is ticked. */
export function nobodyPicks(activity: Pick<Activity, "squad_fill" | "proxy_fields">): boolean {
  return (activity.squad_fill ?? "captains") === "captains" && activity.proxy_fields.length === 0;
}

/**
 * A tournament's settings (D640, D641), shared by the add form and the Setup card: the shared
 * details, the squad deadline in Malaysia time, who fills squads, and the fields that make a picker.
 */
export function TournamentSetupFields({ activity, categories, fields, uploadImage }: {
  activity?: Activity;
  categories: string[];
  fields: AttendeeField[];
  uploadImage?: UploadImage;
}) {
  const [date, time] = activity?.squads_close_at ? isoToLocalInput(activity.squads_close_at).split("T") : ["", "18:00"];
  const fill = activity?.squad_fill ?? "captains";
  const ticked = new Set(activity?.proxy_fields ?? []);
  return (
    <>
      <Field label="Name" name="name" defaultValue={activity?.name ?? "Sports Carnival"} />
      <RichTextEditor name="description" label="Description (optional)" defaultValue={activity?.description} description={SECTIONS_HINT} uploadImage={uploadImage} />
      <ImageField label="Image (optional)" name="image" url={activity?.image_url} description={COVER_HINT} />
      <CategoryCombo categories={categories} defaultValue={activity?.categories ?? []} />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-bold">Squad deadline</legend>
        <p className="text-xs text-muted-foreground">Malaysia time. From then on squads are locked, and only organisers can change them.</p>
        <div className="flex flex-wrap gap-2">
          <input type="date" name="close_date" aria-label="Deadline date" defaultValue={date} required className={input} />
          <input type="time" name="close_time" aria-label="Deadline time" defaultValue={time} required className={input} />
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-bold">Who fills squads</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="squad_fill" value="captains" defaultChecked={fill === "captains"} className="size-4" />
          Captains pick (members with a Yes in a ticked field below)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="squad_fill" value="self" defaultChecked={fill === "self"} className="size-4" />
          Members join themselves
        </label>
      </fieldset>
      {fields.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-bold">Who picks squads</legend>
          <p className="text-xs text-muted-foreground">
            Members whose answer to a ticked field is Yes, like a Captain column, can pick anyone in their group for any sport. With Members join themselves, they can also remove people.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {fields.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="proxy_fields" value={f.key} defaultChecked={ticked.has(f.key)} className="size-4" />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Field
        label="Points per place (optional)" name="place_points" defaultValue={activity?.place_points?.join(", ") ?? ""}
        placeholder="40, 35, 30, 29, 28, 27, 26, 25, 24, 23, 22, 20"
        description="1st first, separated by commas. Every sport uses this one table. Leave blank for no overall leaderboard."
      />
      <Field
        label="Full participation bonus (optional)" name="participation_bonus" type="number" defaultValue={activity?.participation_bonus ? String(activity.participation_bonus) : ""}
        placeholder="100"
        description="Points added to a group's overall total once every member is in at least one sport's squad. Leave blank for no bonus."
      />
      {activity && nobodyPicks(activity) && (
        <p className="text-sm font-bold text-warning">Nobody can pick squads yet. Tick at least one field, or let members join themselves.</p>
      )}
    </>
  );
}
