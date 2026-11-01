import { Clock } from "lucide-react";
import { type Activity } from "@/lib/types";
import { t } from "@/features/language/client";
import type { Lang } from "@/features/language/client";
import { MapLink } from "./MapLink";

export const block = "-mx-4 border-t-8 border-muted px-4 py-5 md:mx-0 md:px-0";
export const note = "text-sm text-muted-foreground";

/** "For VIP, Management" when only some groups may take part; nothing when everyone may. */
export function forGroups(activity: Pick<Activity, "categories">, lang: Lang = "en"): string | null {
  return activity.categories?.length ? t(lang).activities.forGroups(activity.categories.join(", ")) : null;
}

/** `map` puts the map button at the row's end (D798): the link, and the place it names. */
export function InfoRows({ rows, lang = "en" }: {
  rows: { icon: typeof Clock; text: string | null; map?: { href: string | null; place: string | null } }[];
  lang?: Lang;
}) {
  const shown = rows.filter((r) => r.text);
  if (shown.length === 0) return null;
  return (
    <div className="-mx-4 flex flex-col border-t border-border px-4 md:mx-0 md:px-0">
      {shown.map(({ icon: Icon, text, map }) => (
        <div key={text} className="flex items-center gap-3 border-b border-border py-3 text-sm">
          <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">{text}</span>
          {/* -my-2: the button is taller than a line of text, and the row should not grow for it. */}
          {map && <MapLink href={map.href} place={map.place} lang={lang} className="-my-2" />}
        </div>
      ))}
    </div>
  );
}
