import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { MODULE_ICONS, TILE_ROUTES, TILE_ROUTE_LABELS, normalizeModules, type EventModule } from "@/lib/modules";
import { MAX_TILES, moduleId } from "@/lib/modules-form";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Field } from "@/components/admin/Field";
import { Modal } from "@/components/admin/Modal";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { TileList } from "@/components/admin/TileList";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { saveModuleAction, deleteModuleAction, toggleModuleAction, reorderModulesAction } from "../actions";

export const metadata = { title: "Modules · Orange Lobby" };

const select = "w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The add/edit form for one tile.
 *
 * Both the link and the portal-page inputs stay mounted whatever "Opens" is set to, so
 * switching between them does not throw away what was typed. `moduleFromForm` reads only
 * the one the chooser selected.
 */
function TileForm({ eventId, module: m }: { eventId: string; module?: EventModule }) {
  const isPlan = m?.key === "floor_plan";
  const tile = m?.key === "tile" ? m : undefined;
  return (
    <form action={saveModuleAction.bind(null, eventId)} className="grid gap-4 p-1">
      <input type="hidden" name="id" value={m ? moduleId(m) : ""} />
      <input type="hidden" name="preset" value={isPlan ? "floor_plan" : "tile"} />

      <Field label="Label" name="label" defaultValue={m && "label" in m ? m.label ?? "" : ""} placeholder={isPlan ? "Floor plan" : "Q&A"} />
      <Field label="Subtitle (optional)" name="subtitle" defaultValue={m && "subtitle" in m ? m.subtitle ?? "" : ""} placeholder="Ask the directors" />

      {isPlan ? (
        <Field label="Floor plan image URL" name="url" type="url" defaultValue={m.url ?? ""} placeholder="https://" description="The image the floor plan page shows. Without it the tile stays hidden." />
      ) : (
        <>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="target_kind">Opens</label>
            <select id="target_kind" name="target_kind" defaultValue={tile?.target.kind ?? "url"} className={select}>
              <option value="url">A link, outside the portal</option>
              <option value="route">A page inside the portal</option>
            </select>
          </div>
          <Field label="Link URL" name="url" type="url" defaultValue={tile?.target.kind === "url" ? tile.target.url : ""} placeholder="https://" description="Used when this tile opens a link." />
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="route">Portal page</label>
            <select id="route" name="route" defaultValue={tile?.target.kind === "route" ? tile.target.route : "agenda"} className={select}>
              {TILE_ROUTES.map((r) => <option key={r} value={r}>{TILE_ROUTE_LABELS[r]}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">Used when this tile opens a page inside the portal.</p>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="icon">Icon</label>
            <select id="icon" name="icon" defaultValue={tile?.icon ?? "link"} className={select}>
              {MODULE_ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
            </select>
          </div>
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
      <AdminHeader title="Modules" subtitle="The tiles on the portal home, in the order attendees see them." />
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
        <Icon name="info" size={14} /> The floor plan image URL now lives on its tile, not in Settings.
      </p>
    </div>
  );
}
