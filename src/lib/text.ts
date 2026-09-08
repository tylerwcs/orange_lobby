export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

// Built by hand rather than via Intl/en-GB: ICU data on some Node builds
// abbreviates September as "Sept" instead of "Sep", which is inconsistent
// across environments and breaks the Malaysia-style rendering below.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmt = (d: string, withYear: boolean) => {
  const dt = new Date(d + "T00:00:00Z");
  const day = dt.getUTCDate();
  const month = MONTHS[dt.getUTCMonth()];
  return withYear ? `${day} ${month} ${dt.getUTCFullYear()}` : `${day} ${month}`;
};

export function formatDateRange(starts: string | null, ends: string | null): string {
  if (!starts && !ends) return "";
  const a = starts ?? ends!, b = ends ?? starts!;
  if (a === b) return fmt(a, true);
  return `${fmt(a, false)} – ${fmt(b, true)}`;
}
