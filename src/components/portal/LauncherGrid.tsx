import Link from "next/link";
import type { LauncherItem } from "@/lib/launcher";
import { Icon } from "@/components/ui/icon";

function Button({ item, large }: { item: LauncherItem; large: boolean }) {
  return (
    <>
      <span className={`relative flex items-center justify-center rounded-full bg-accent text-primary transition-transform group-active:scale-95 ${large ? "size-16" : "size-14"}`}>
        {item.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={item.image} alt="" className="size-full rounded-full object-contain p-1" />
          : <Icon name={item.icon} size={large ? 28 : 24} />}
        {item.dot && (
          <>
            <span aria-hidden className="absolute right-0.5 top-0.5 size-3 rounded-full bg-primary ring-2 ring-background" />
            <span className="sr-only">, a choice is waiting</span>
          </>
        )}
      </span>
      <span className="line-clamp-2 text-xs font-bold leading-tight">{item.label}</span>
    </>
  );
}

/**
 * The home page's round buttons (D212): on a phone, every section and tile - the portal's
 * whole navigation now the bottom bar is gone (D209); on the desktop dashboard, the tiles only.
 *
 * `row` is the phone's: one line that swipes sideways and runs out to the screen edge
 * (D217). Each column is a quarter of the page's width, so four large buttons fill it and a
 * fifth starts in the right-hand gutter. `grid` wraps four to a line, at the smaller size,
 * and is the desktop column's.
 */
export function LauncherGrid({ items, layout = "grid", className = "" }: {
  items: LauncherItem[];
  layout?: "row" | "grid";
  className?: string;
}) {
  if (items.length === 0) return null;
  const cls = "group flex flex-col items-center gap-1.5 rounded-xl px-0.5 py-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const list = layout === "row"
    ? "-mx-4 flex snap-x scroll-px-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>li]:w-1/4 [&>li]:shrink-0 [&>li]:snap-start"
    : "grid grid-cols-4 gap-x-1 gap-y-3 @xl:grid-cols-6";
  return (
    <nav aria-label="Sections" className={`@container ${className}`}>
      <ul className={list}>
        {items.map((item) => (
          <li key={item.id}>
            {item.external
              ? <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}><Button item={item} large={layout === "row"} /></a>
              : <Link href={item.href} className={cls}><Button item={item} large={layout === "row"} /></Link>}
          </li>
        ))}
      </ul>
    </nav>
  );
}
