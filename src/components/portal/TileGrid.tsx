import Link from "next/link";
import type { Tile } from "@/lib/modules";
import { Icon } from "@/components/ui/icon";

function TileBody({ t }: { t: Tile }) {
  return (
    <>
      <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-accent text-primary"><Icon name={t.icon} size={22} /></div>
      <div><div className="text-[15px] font-extrabold">{t.label}</div>{t.subtitle && <div className="line-clamp-2 text-xs text-muted-foreground">{t.subtitle}</div>}</div>
    </>
  );
}

export function TileGrid({ tiles }: { tiles: Tile[] }) {
  if (tiles.length === 0) return <p className="text-sm text-muted-foreground">Nothing to show yet.</p>;
  const cls = "flex min-h-[108px] flex-col justify-between gap-2.5 rounded-xl bg-card ring-1 ring-foreground/10 p-4 transition active:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map((t) => t.external
        ? <a key={t.id} href={t.href} target="_blank" rel="noopener noreferrer" className={cls}><TileBody t={t} /></a>
        : <Link key={t.id} href={t.href} className={cls}><TileBody t={t} /></Link>)}
    </div>
  );
}
