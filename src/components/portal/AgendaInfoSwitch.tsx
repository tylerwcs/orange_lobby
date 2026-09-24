import Link from "next/link";

/**
 * The two tabs of the Info section: the agenda and the event's info page.
 *
 * Links rather than client-side tabs. Both pages keep their own routes, so the agenda's
 * `?day=` links, the desktop venue card's link to /info and any bookmark all still land on
 * the right tab, and neither page has to load the other's data to be switched to.
 *
 * Only drawn when the event has an info page; without one the slot is plain Agenda and a
 * switch with one side would be a control for nothing.
 */
export function AgendaInfoSwitch({ basePath, current }: { basePath: string; current: "agenda" | "info" }) {
  const tabs = [
    { key: "agenda", href: `${basePath}/agenda`, label: "Agenda" },
    { key: "info", href: `${basePath}/info`, label: "Info" },
  ] as const;
  return (
    <nav aria-label="Agenda and info" className="mb-4 flex rounded-[12px] bg-muted p-1">
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 flex-1 items-center justify-center rounded-[9px] text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-card font-bold text-foreground shadow-[0_1px_2px_rgba(17,24,39,.08)]" : "font-semibold text-muted-foreground"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
