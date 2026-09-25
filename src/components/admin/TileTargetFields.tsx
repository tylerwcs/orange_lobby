"use client";
import { useState } from "react";
import { Field } from "@/components/admin/Field";
import type { TileRoute } from "@/lib/modules";

const select = "w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Where a tile goes: the chooser, then only the input that choice needs.
 *
 * The other input stays mounted, hidden and disabled, so switching back and forth keeps what
 * was typed. Disabled rather than only hidden: a disabled field is neither posted nor
 * validated, so a half-typed link cannot block saving a tile that opens a portal page.
 * `moduleFromForm` reads only the one the chooser names either way.
 */
export function TileTargetFields({ kind: initialKind, url, route, routes, routeLabels }: {
  kind: "url" | "route";
  url: string;
  route: TileRoute;
  routes: readonly TileRoute[];
  routeLabels: Record<TileRoute, string>;
}) {
  const [kind, setKind] = useState(initialKind);
  return (
    <>
      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor="target_kind">Opens</label>
        <select id="target_kind" name="target_kind" value={kind} onChange={(e) => setKind(e.target.value as "url" | "route")} className={select}>
          <option value="url">A link, outside the portal</option>
          <option value="route">A page inside the portal</option>
        </select>
      </div>
      <fieldset disabled={kind !== "url"} hidden={kind !== "url"} className="contents">
        <Field label="Link URL" name="url" type="url" defaultValue={url} placeholder="https://" />
      </fieldset>
      <fieldset disabled={kind !== "route"} hidden={kind !== "route"} className="contents">
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="route">Portal page</label>
          <select id="route" name="route" defaultValue={route} className={select}>
            {routes.map((r) => <option key={r} value={r}>{routeLabels[r]}</option>)}
          </select>
        </div>
      </fieldset>
    </>
  );
}
