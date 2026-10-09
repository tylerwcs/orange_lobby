"use client";
import { memo, useMemo } from "react";
import type { Person } from "../../wire";
import { gridFor, seededOrder, tierFor } from "../../mosaic";

const GAP = 4;
const SPREAD_MS = 2000;

/**
 * One tile per player (D274): initials large, first name small, at every size (D273). With
 * `darken`, the tiles in `darkIds` fade to near-black greyscale in a staggered ripple over
 * ~2 s, in an order seeded by `seed` so a reload replays it identically (D275). `hideDark`
 * drops them so the survivors regroup into bigger tiles.
 */
export const Mosaic = memo(function Mosaic({
  people, darkIds, darken = false, hideDark = false, seed = "", width = 1840, height = 960,
}: {
  people: Person[];
  darkIds?: ReadonlySet<string>;
  darken?: boolean;
  hideDark?: boolean;
  seed?: string;
  width?: number;
  height?: number;
}) {
  const shown = hideDark && darkIds ? people.filter((p) => !darkIds.has(p.id)) : people;
  const { cols, cell } = gridFor(shown.length, width, height);
  const delays = useMemo(() => {
    const m = new Map<string, number>();
    if (!darkIds?.size) return m;
    const order = seededOrder(people.filter((p) => darkIds.has(p.id)).map((p) => p.id), seed);
    order.forEach((id, i) => m.set(id, order.length > 1 ? (i / (order.length - 1)) * SPREAD_MS : 0));
    return m;
  }, [people, darkIds, seed]);
  const size = Math.max(8, cell - GAP);
  const finalist = tierFor(shown.length) === "finalist";

  return (
    <div className="grid h-full content-center justify-center"
      style={{ gap: GAP, gridTemplateColumns: `repeat(${cols}, ${size}px)`, gridAutoRows: `${size}px` }}>
      {shown.map((p) => {
        const out = darken && !!darkIds?.has(p.id);
        return (
          <div key={p.id} className={`mosaic-tile ${out ? "mosaic-dark" : darken ? "mosaic-lit" : ""}`}
            style={{ transitionDelay: out ? `${delays.get(p.id) ?? 0}ms` : undefined, borderRadius: Math.max(4, size * 0.08) }}>
            <span className="font-extrabold leading-none" style={{ fontSize: size * (finalist ? 0.28 : 0.34) }}>{p.initials}</span>
            <span className="mt-[0.2em] max-w-full truncate px-[6%] leading-none opacity-85" style={{ fontSize: Math.max(9, size * (finalist ? 0.12 : 0.15)) }}>
              {p.label}
            </span>
          </div>
        );
      })}
    </div>
  );
});
