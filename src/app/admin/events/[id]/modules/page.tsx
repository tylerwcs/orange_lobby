import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { MODULE_ICONS, TILE_ROUTES, TILE_ROUTE_LABELS, normalizeModules, type EventModule, type ModuleIcon } from "@/lib/modules";
import { MAX_TILES, moduleId } from "@/lib/modules-form";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Field } from "@/components/admin/Field";
import { ImageField } from "@/components/admin/ImageField";
import { Modal } from "@/components/admin/Modal";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { TileList } from "@/components/admin/TileList";
import { TileTargetFields } from "@/components/admin/TileTargetFields";
import { AdminHeader } from "@/components/admin/AdminHeader";
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
function TileForm({ eventId, module: m }: { eventId: string; module?: EventModule }) {
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
  const hasPlan = modules.some((m) => m.key === "floor_plan");

  // Keyed by id, not position: TileList reorders optimistically and would otherwise pair
  // a row with another tile's form mid-drag.
  const editors = Object.fromEntries(modules.map((m) => [
    moduleId(m),
    <Modal key={moduleId(m)} title="Edit tile" trigger="Edit" variant="ghost">
      <TileForm eventId={ev.id} module={m} />
    </Modal>,
  ]));

  return (
    <div className="space-y-4">
      <AdminHeader title="Modules" subtitle="The round buttons on the portal home, in the order attendees see them." />
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <div className="font-bold">Tiles</div>
            <div className="text-xs text-muted-foreground">{modules.length} of {MAX_TILES} used.</div>
          </div>
          <div className="flex gap-2">
            {!hasPlan && (
              <Modal title="Add the floor plan" hint="A preset tile that opens the venue layout inside the portal." trigger="Add floor plan" icon="map" variant="outline">
                <TileForm eventId={ev.id} module={{ key: "floor_plan", enabled: true }} />
              </Modal>
            )}
            <Modal title="Add a tile" hint="A tile can open a link, or a page inside the portal." trigger="Add tile" icon="plus">
              <TileForm eventId={ev.id} />
            </Modal>
          </div>
        </div>
        <div className="px-4 pb-4">
          <TileList
            items={modules}
            editors={editors}
            reorder={reorderModulesAction.bind(null, ev.id)}
            remove={deleteModuleAction.bind(null, ev.id)}
            toggle={toggleModuleAction.bind(null, ev.id)}
          />
        </div>
      </Card>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon name="info" size={14} /> The floor plan image now lives on its tile, not in Settings.
      </p>
    </div>
  );
}
