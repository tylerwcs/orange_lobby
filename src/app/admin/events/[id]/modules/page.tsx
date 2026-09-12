import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { TILE_BUILTINS, MODULE_ICONS, defaultModules, type LinkModule } from "@/lib/modules";
import { MAX_LINK_TILES } from "@/lib/modules-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { updateModulesAction } from "../actions";
import { AdminHeader } from "@/components/admin/AdminHeader";

export const metadata = { title: "Modules · Orange Lobby" };

/**
 * Only the built-ins that still draw a tile. Agenda and Info moved to the portal's bottom
 * nav, Announcements is the banner on the portal home and the table number is on the badge
 * card, so switches for those controlled a second route to something already on screen.
 */
const NAMES: Record<(typeof TILE_BUILTINS)[number], { label: string; help: string }> = {
  floor_plan: { label: "Floor plan", help: "Shown only when the event has a floor plan image URL." },
};

export default async function ModulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin(); const ev = await requireEvent(id, orgId);
  const mods = ev.modules?.length ? ev.modules : defaultModules();
  const builtin = (k: string) => mods.find((m) => m.key === k && m.key !== "link") as { enabled: boolean; label?: string; subtitle?: string } | undefined;
  const links = mods.filter((m): m is LinkModule => m.key === "link");
  const input = "w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
  return (
    <form action={updateModulesAction.bind(null, ev.id)} className="space-y-4">
      <AdminHeader title="Modules" subtitle="What appears on the portal home, and in what order." />
      <div className="@container"><div className="grid gap-4 items-start @5xl:grid-cols-2">
      <Card className="gap-0 divide-y py-0">
        <div className="p-4"><div className="font-bold">Built-in tiles</div><div className="text-xs text-muted-foreground">Agenda, Info and Announcements are no longer tiles — they live in the portal’s bottom nav and its banner. What is left here is the floor plan.</div></div>
        {TILE_BUILTINS.map((key) => { const m = builtin(key); return (
          <div key={key} className="grid gap-3 p-4 md:grid-cols-[minmax(12rem,1fr)_1fr_1fr]">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name={`mod_${key}_enabled`} defaultChecked={m?.enabled ?? true} className="mt-1 size-4 accent-primary" />
              <span><span className="block font-bold">{NAMES[key].label}</span><span className="block text-xs text-muted-foreground">{NAMES[key].help}</span></span>
            </label>
            <input name={`mod_${key}_label`} defaultValue={m?.label ?? ""} placeholder="Custom label (optional)" className={input} />
            <input name={`mod_${key}_subtitle`} defaultValue={m?.subtitle ?? ""} placeholder="Custom subtitle (optional)" className={input} />
          </div>
        ); })}
      </Card>
      <Card className="gap-0 divide-y py-0">
        <div className="p-4"><div className="font-bold">Link tiles</div><div className="text-xs text-muted-foreground">Up to {MAX_LINK_TILES} tiles that open an external page: Slido Q&amp;A, a feedback form, a documents folder.</div></div>
        {Array.from({ length: MAX_LINK_TILES }, (_, i) => i + 1).map((n) => { const l = links[n - 1]; return (
          <div key={n} className="grid gap-3 p-4 md:grid-cols-[auto_1fr_1fr]">
            <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" name={`link_${n}_enabled`} defaultChecked={l?.enabled ?? true} className="size-4 accent-primary" /> Tile {n}</label>
            <input name={`link_${n}_label`} defaultValue={l?.label ?? ""} placeholder="Label" className={input} />
            <input name={`link_${n}_subtitle`} defaultValue={l?.subtitle ?? ""} placeholder="Subtitle (optional)" className={input} />
            <div />
            <input name={`link_${n}_url`} defaultValue={l?.url ?? ""} placeholder="https://" className={input} />
            <select name={`link_${n}_icon`} defaultValue={l?.icon ?? "link"} className={input}>{MODULE_ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}</select>
          </div>
        ); })}
      </Card>
      </div>
      </div>
      <div className="flex items-center gap-3"><Button type="submit">Save modules</Button><span className="flex items-center gap-1 text-xs text-muted-foreground"><Icon name="info" size={14} /> Tiles appear on the portal home in this order.</span></div>
    </form>
  );
}
