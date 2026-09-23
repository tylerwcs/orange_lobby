import { CalendarDays, Clock, MapPin, Ticket } from "lucide-react";
import type { CardTone, CardView } from "@/lib/activity-card";
import type { Activity } from "@/lib/types";

/**
 * The small pieces an activity is drawn from, shared by its card on the Activities tab and the
 * head of its own page, so the two always look like the same thing.
 */

const TONES: Record<CardTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success-soft text-success-strong",
  warning: "bg-warning-soft text-warning",
  muted: "bg-muted text-muted-foreground",
};

export function StatusChip({ status }: { status: NonNullable<CardView["status"]> }) {
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${TONES[status.tone]}`}>{status.label}</span>;
}

/** What kind of activity this is, in the words an attendee would use. */
export function KindTag({ kind }: { kind: Activity["kind"] }) {
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
      {kind === "booking" ? "Sessions" : "Submission"}
    </span>
  );
}

const META_ICONS = { calendar: CalendarDays, pin: MapPin, clock: Clock } as const;

export function MetaLine({ meta }: { meta: NonNullable<CardView["meta"]> }) {
  const Icon = META_ICONS[meta.icon];
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{meta.text}</span>
    </span>
  );
}

/**
 * On a phone the page's picture runs edge to edge, out through <main>'s 16px gutters; from md
 * it sits inside the column with rounded corners. Owned here rather than passed in: an <img>
 * needs its width stated to fill the bleed, and a caller's width class next to this
 * component's own `w-full` is two widths with no telling which the stylesheet lets win.
 */
const HERO_BLEED = "-mx-4 md:mx-0 md:rounded-2xl";

/**
 * The activity's picture: the organiser's image, or - when there is none - a panel in the
 * event's own brand colour carrying the activity's name, so a card never looks broken for the
 * want of a poster.
 *
 * On a card the image is cropped to a 2:1 strip, because a list of cards has to line up. On
 * the activity's page it is shown whole: that is where the poster is actually read. The
 * brand-colour panel is shorter than a picture would be - it repeats the name printed just
 * below it, and a tall block of flat colour is a lot of screen for that.
 */
export function ActivityCover({ activity, variant, className = "" }: {
  activity: Pick<Activity, "name" | "image_url">;
  variant: "card" | "hero";
  className?: string;
}) {
  if (activity.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={activity.image_url}
        alt=""
        className={`${variant === "card" ? "aspect-[2/1] w-full object-cover" : `block h-auto ${HERO_BLEED} w-[calc(100%+2rem)] max-w-none md:w-full`} bg-muted ${className}`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`flex items-end justify-between gap-3 bg-brand p-4 text-brand-foreground ${variant === "card" ? "aspect-[3/1]" : `aspect-[3/1] md:aspect-[5/1] ${HERO_BLEED}`} ${className}`}
    >
      <span className={`font-extrabold leading-tight ${variant === "card" ? "text-lg" : "text-2xl"}`}>{activity.name}</span>
      <Ticket className={`shrink-0 opacity-80 ${variant === "card" ? "size-6" : "size-8"}`} />
    </div>
  );
}
