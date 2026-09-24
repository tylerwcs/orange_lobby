import Link from "next/link";
import type { LauncherItem } from "@/lib/launcher";
import { Icon } from "@/components/ui/icon";

function Button({ item }: { item: LauncherItem }) {
  return (
    <>
      <span className="relative flex size-14 items-center justify-center rounded-full bg-accent text-primary transition-transform group-active:scale-95">
        {item.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={item.image} alt="" className="size-full rounded-full object-contain p-1" />
          : <Icon name={item.icon} size={24} />}
        {item.dot && (
          <>
            <span aria-hidden className="absolute right-0.5 top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background" />
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
 * Four to a row in a phone column and in the 300px desktop column alike, more once the grid
 * has room - container queries, because the same grid sits in both.
 */
export function LauncherGrid({ items, className = "" }: { items: LauncherItem[]; className?: string }) {
  if (items.length === 0) return null;
  const cls = "group flex flex-col items-center gap-1.5 rounded-xl px-0.5 py-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <nav aria-label="Sections" className={`@container ${className}`}>
      <ul className="grid grid-cols-4 gap-x-1 gap-y-3 @xl:grid-cols-6">
        {items.map((item) => (
          <li key={item.id}>
            {item.external
              ? <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}><Button item={item} /></a>
              : <Link href={item.href} className={cls}><Button item={item} /></Link>}
          </li>
        ))}
      </ul>
    </nav>
  );
}
