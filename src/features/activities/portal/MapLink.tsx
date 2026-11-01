import { MapPinned } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { t, type Lang } from "@/features/language/client";

/**
 * The map button beside a location (D798): an icon that opens the organiser's link in a new tab,
 * which on a phone usually hands over to the maps app. Nothing at all without a link, so a
 * location with none reads exactly as it did before.
 *
 * A plain anchor, not a client component, so the same button sits in server-rendered pages,
 * the booking sheet and the admin's lists. Not for anywhere already inside a link (a portal
 * card), where a second link is invalid and the tap would be ambiguous.
 */
export function MapLink({ href, place, lang = "en", size = "icon-lg", className = "" }: {
  href: string | null | undefined;
  /** The location's own words, for the button's name: "Open Level 3 gym in maps". */
  place: string | null | undefined;
  lang?: Lang;
  size?: "icon-lg" | "icon-sm";
  className?: string;
}) {
  if (!href) return null;
  const label = t(lang).activities.openMap(place?.trim() || "the location");
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}
      className={`${buttonVariants({ variant: "outline", size })} shrink-0 text-primary ${className}`}>
      <MapPinned aria-hidden />
    </a>
  );
}
