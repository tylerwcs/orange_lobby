import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { MODULE_ICONS, TILE_ROUTES, TILE_ROUTE_LABELS, normalizeModules, type EventModule, type ModuleIcon } from "@/lib/modules";
import { MAX_TILES, moduleId } from "@/lib/modules-form";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Field } from "@/components/admin/Field";
import { ImageField } from "@/components/admin/ImageField";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ModuleList } from "@/components/admin/ModuleList";
import { NewTileMenu } from "@/components/admin/NewTileMenu";
import { TileTargetFields } from "@/components/admin/TileTargetFields";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { CategoryCombo } from "@/components/admin/AgendaCombos";
import { listCategories } from "@/lib/db/attendees";
import { saveModuleAction, deleteModuleAction, toggleModuleAction, reorderModulesAction } from "../actions";

export const metadata = { title: "Modules" };

/** What each icon is called, for its tooltip and for screen readers. */
const ICON_LABELS: Record<ModuleIcon, string> = {
  calendar: "Calendar", seat: "Seat", map: "Map", info: "Info", megaphone: "Megaphone", mic: "Microphone",
  file: "Document", chat: "Chat", check: "Tick", phone: "Phone", link: "Link", star: "Star", users: "People",
  download: "Download",
};

/**
 * The add/edit form for one tile: what it is called, where it goes, and what it looks like.
 *
 * Where it goes shows only the input the "Opens" choice needs (`TileTargetFields`). What it
 * looks like is the icon, picked from the pictures themselves, and optionally an uploaded
 * image that replaces it in the round button (D212, D213).
 *
 * There is no Subtitle field: the round buttons dropped subtitles (D212) and nothing renders
 * one. A tile saved before that keeps its stored subtitle through a hidden input, so saving
 * here does not quietly erase it.
 */
function TileForm({ eventId, module: m, categories }: { eventId: string; module?: EventModule; categories: string[] }) {
  const isPlan = m?.key === "floor_plan";
  const tile = m?.key === "tile" ? m : undefined;
  const iconImage = m && "icon_image" in m ? m.icon_image : undefined;
  const subtitle = m && "subtitle" in m ? m.subtitle : undefined;
  const iconImageField = (
    <ImageField label="Icon image (optional)" name="icon_image" url={iconImage} description="Replaces the icon in the round button. A square picture with a transparent background works best." />
  );
  return (
    <form action={saveModuleAction.bind(null, eventId)} className="grid gap-4 p-1">
      <input type="hidden" name="id" value={m ? moduleId(m) : ""} />
      <input type="hidden" name="preset" value={isPlan ? "floor_plan" : "tile"} />
      {subtitle && <input type="hidden" name="subtitle" value={subtitle} />}

      <Field label="Label" name="label" defaultValue={m && "label" in m ? m.label ?? "" : ""} placeholder={isPlan ? "Floor plan" : "Q&A"} description="Shown under the round button." />

      {isPlan ? (
        <>
          <ImageField label="Floor plan image" name="url" url={m.url} description="The image the floor plan page shows. Without it the tile stays hidden." />
          {iconImageField}
        </>
      ) : (
        <>
          <TileTargetFields
            kind={tile?.target.kind ?? "url"}
            url={tile?.target.kind === "url" ? tile.target.url : ""}
            route={tile?.target.kind === "route" ? tile.target.route : "agenda"}
            routes={TILE_ROUTES}
            routeLabels={TILE_ROUTE_LABELS}
          />
          {/* The icons themselves rather than their names: "link" and "file" in a dropdown
              said nothing about what attendees would see. Radios, so it needs no script. */}
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Icon</legend>
            <div className="grid grid-cols-7 gap-1.5">
              {MODULE_ICONS.map((ic) => (
                <label
                  key={ic}
                  title={ICON_LABELS[ic]}
                  className="flex aspect-square cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted has-checked:border-primary has-checked:bg-accent has-checked:text-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                >
                  <input type="radio" name="icon" value={ic} defaultChecked={(tile?.icon ?? "link") === ic} className="sr-only" aria-label={ICON_LABELS[ic]} />
                  <Icon name={ic} size={20} />
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Used when there is no icon image.</p>
          </fieldset>
          {iconImageField}
        </>
      )}

      {/* Who sees the tile on their home, as on agenda rows. */}
      <CategoryCombo categories={categories} defaultValue={m?.categories ?? []} />

      <label className="flex items-center gap-3 text-sm font-medium">
        <input type="checkbox" name="enabled" defaultChecked={m?.enabled ?? true} className="size-4 accent-primary" />
        Show this tile on the portal home
      </label>

      <SubmitButton>{m ? "Save tile" : "Add tile"}</SubmitButton>
    </form>
  );
}

export default async function ModulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const modules = normalizeModules(ev);
  const categories = await listCategories(ev.id);
  const hasPlan = modules.some((m) => m.key === "floor_plan");

  const shown = modules.filter((m) => m.enabled).length;
  const full = modules.length >= MAX_TILES;

  // Keyed by id, not position: ModuleList reorders optimistically and would otherwise pair
  // a row with another tile's form mid-drag.
  const editors = Object.fromEntries(modules.map((m) => [moduleId(m), <TileForm key={moduleId(m)} eventId={ev.id} module={m} categories={categories} />]));

  // Laid out like Activities (D179): one "New" menu in the header, then one card holding the
  // list, each row the same shape.
  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title="Modules"
        subtitle={`${modules.length} of ${MAX_TILES} tiles · ${shown} shown on the portal home, in this order`}
        actions={
          <NewTileMenu
            disabled={full}
            forms={{
              tile: <TileForm eventId={ev.id} categories={categories} />,
              ...(hasPlan ? {} : { floor_plan: <TileForm eventId={ev.id} module={{ key: "floor_plan", enabled: true }} categories={categories} /> }),
            }}
          />
        }
      />
      <Card className="overflow-hidden py-0">
        <CardContent className="px-0">
          <ModuleList
            items={modules}
            editors={editors}
            reorder={reorderModulesAction.bind(null, ev.id)}
            remove={deleteModuleAction.bind(null, ev.id)}
            toggle={toggleModuleAction.bind(null, ev.id)}
          />
        </CardContent>
      </Card>
      {full && <p className="text-xs text-muted-foreground">That is the most the portal home holds. Remove a tile to add another.</p>}
    </div>
  );
}
