import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { BUILTIN_MODULES, MODULE_ICONS, defaultModules, type LinkModule } from "@/lib/modules";
import { MAX_LINK_TILES } from "@/lib/modules-form";
import { Card, Button } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { updateModulesAction } from "../actions";

export const metadata = { title: "Modules · Orange Lobby" };

const NAMES: Record<(typeof BUILTIN_MODULES)[number], { label: string; help: string }> = {
  agenda: { label: "Agenda", help: "Programme by day. Subtitle shows the next session automatically." },
  seat: { label: "My seat", help: "Personal links only. Shows the attendee’s table from their record." },
  floor_plan: { label: "Floor plan", help: "Shown only when the event has a floor plan image URL." },
  info: { label: "Info page", help: "Shown only when the info page has content. Label defaults to the page title." },
  announcements: { label: "Announcements", help: "Subtitle shows the latest announcement." },
};

export default async function ModulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin(); const ev = await requireEvent(id, orgId);
  const mods = ev.modules?.length ? ev.modules : defaultModules();
  const builtin = (k: string) => mods.find((m) => m.key === k && m.key !== "link") as { enabled: boolean; label?: string; subtitle?: string } | undefined;
  const links = mods.filter((m): m is LinkModule => m.key === "link");
  const input = "w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-sm";
  return (
    <form action={updateModulesAction.bind(null, ev.id)} className="space-y-4">
      <h1 className="mb-4 text-2xl font-extrabold">Modules</h1>
      <div className="grid gap-4 items-start xl:grid-cols-2">
      <Card className="divide-y divide-line">
        <div className="p-4"><div className="font-bold">Built-in tiles</div><div className="text-xs text-muted">Switch a tile off to hide it; give it a custom label or subtitle if the default reads wrong for this event.</div></div>
        {BUILTIN_MODULES.map((key) => { const m = builtin(key); return (
          <div key={key} className="grid gap-3 p-4 md:grid-cols-[minmax(12rem,1fr)_1fr_1fr]">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name={`mod_${key}_enabled`} defaultChecked={m?.enabled ?? true} className="mt-1 size-4 accent-[var(--brand)]" />
              <span><span className="block font-bold">{NAMES[key].label}</span><span className="block text-xs text-muted">{NAMES[key].help}</span></span>
            </label>
            <input name={`mod_${key}_label`} defaultValue={m?.label ?? ""} placeholder="Custom label (optional)" className={input} />
            <input name={`mod_${key}_subtitle`} defaultValue={m?.subtitle ?? ""} placeholder="Custom subtitle (optional)" className={input} />
          </div>
        ); })}
      </Card>
      <Card className="divide-y divide-line">
        <div className="p-4"><div className="font-bold">Link tiles</div><div className="text-xs text-muted">Up to {MAX_LINK_TILES} tiles that open an external page: Slido Q&amp;A, a feedback form, a documents folder.</div></div>
        {Array.from({ length: MAX_LINK_TILES }, (_, i) => i + 1).map((n) => { const l = links[n - 1]; return (
          <div key={n} className="grid gap-3 p-4 md:grid-cols-[auto_1fr_1fr]">
            <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" name={`link_${n}_enabled`} defaultChecked={l?.enabled ?? true} className="size-4 accent-[var(--brand)]" /> Tile {n}</label>
            <input name={`link_${n}_label`} defaultValue={l?.label ?? ""} placeholder="Label" className={input} />
            <input name={`link_${n}_subtitle`} defaultValue={l?.subtitle ?? ""} placeholder="Subtitle (optional)" className={input} />
            <div />
            <input name={`link_${n}_url`} defaultValue={l?.url ?? ""} placeholder="https://" className={input} />
            <select name={`link_${n}_icon`} defaultValue={l?.icon ?? "link"} className={input}>{MODULE_ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}</select>
          </div>
        ); })}
      </Card>
      </div>
      <div className="flex items-center gap-3"><Button type="submit">Save modules</Button><span className="flex items-center gap-1 text-xs text-muted"><Icon name="info" size={14} /> Tiles appear on the portal home in this order.</span></div>
    </form>
  );
}
