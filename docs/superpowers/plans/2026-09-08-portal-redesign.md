# Portal Redesign (Direction 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare pilot UI with the Direction 2 "tile-grid lobby" visual system across the attendee portal, registration, admin and scanner, with organiser-configurable module tiles, before the 26 Sep code freeze.

**Architecture:** A per-event `modules` JSON list drives a tile grid rendered by server components; pure functions in `src/lib/modules.ts` and `src/lib/agenda.ts` decide which tiles show and what "now/next" is, and are unit-tested. One set of design tokens in `globals.css` plus a small `src/components/ui` kit (icons, cards, buttons) is shared by portal, admin and scanner. No new client-side state beyond what exists.

**Tech Stack:** Next.js 16.3.4 App Router, React 19, Tailwind v4 (CSS-first tokens), `next/font/google` Manrope, zod v4, Vitest 5, Supabase (live project `orange_lobby`, id `wfmqwwcolfigjylkgrsv`).

**Spec:** `docs/superpowers/specs/2026-09-07-orange-lobby-pilot.md` §8 (D26–D33) plus the original decisions.

## Global Constraints

- Node 24, npm 11. Next 16: `params`/`searchParams`/`headers()`/`cookies()` are async; the interceptor is `src/proxy.ts`.
- Light-only design. Tokens: canvas `#F4F5F7`, surface `#FFFFFF`, ink `#111827`, muted `#6B7280`, line `#E5E7EB`, brand from `event.primary_color` (default `#F97316`), brand-ink `#C2410C`, brand-soft `#FFF1E7`. Card radius 16px, control radius 10px, pill 999px. Touch targets ≥ 44px.
- Font: Manrope via `next/font/google`, CSS variable `--font-sans`. No Geist, no Inter, no Arial.
- Icons: inline SVG from `src/components/ui/Icon.tsx` only. No emoji in UI.
- `<img>` tags carry `// eslint-disable-next-line @next/next/no-img-element`.
- All data access stays server-side via `serviceClient()` after the existing guards; no new client fetches.
- Every attendee route keeps its URL. New routes: `/e/[slug]/a/[token]/me`, `/e/[slug]/plan`, `/e/[slug]/a/[token]/plan`, `/admin/events/[id]/modules`.
- Migration `0002_modules.sql` adds `events.modules jsonb not null default '[]'`. Apply to the live project with the Supabase connector's `apply_migration` (project id `wfmqwwcolfigjylkgrsv`) and run `list_tables` to confirm.
- Verification per task: TDD red/green for pure logic, then `npm test`, `npm run build`, `npx eslint src` clean, then a browser check of the named pages against the live database (dev server via `.claude/launch.json` "dev"; test event slug `az-asia-rare-neurology-brand-forum`). Do not delete data you did not create.
- Commit after every task with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Work on branch `feat/portal-redesign` from `main`.

---

## File structure

```
src/app/globals.css                      tokens + base (rewritten)
src/app/layout.tsx                       Manrope font (edited)
src/components/ui/Icon.tsx               SVG icon set by name
src/components/ui/Card.tsx               Card, Stat, Pill, Button (server-safe presentational)
src/lib/modules.ts                       EventModule types, parseModules, defaultModules, resolveTiles
src/lib/modules-form.ts                  modulesFromForm (form fields -> EventModule[])
src/lib/agenda.ts                        + nextSession, isNow
src/lib/time.ts                          + nowInKL
src/lib/types.ts                         + modules on Event
supabase/migrations/0002_modules.sql
src/components/portal/PortalShell.tsx    header, bottom bar, draft gate (rewritten)
src/components/portal/MeCard.tsx         personal card on home
src/components/portal/TileGrid.tsx       grid of tiles
src/components/portal/AnnouncementBanner.tsx
src/components/portal/AgendaList.tsx     day tabs + cards (rewritten)
src/components/portal/AnnouncementList.tsx (rewritten)
src/app/e/[slug]/page.tsx, a/[token]/page.tsx        home (rewritten)
src/app/e/[slug]/a/[token]/me/page.tsx               new
src/app/e/[slug]/plan/page.tsx, a/[token]/plan/page.tsx  new
src/app/e/[slug]/{agenda,announcements,info}/page.tsx + personal twins (restyled)
src/app/e/[slug]/a/[token]/seat/page.tsx (restyled)
src/app/e/[slug]/register/{page,RegisterForm,done/page}.tsx (restyled)
src/app/e/[slug]/not-found.tsx, error.tsx, src/app/not-found.tsx (restyled)
src/app/admin/layout.tsx                 sidebar shell (rewritten)
src/components/admin/Sidebar.tsx         new
src/app/admin/page.tsx, admin/events/[id]/layout.tsx, admin/events/[id]/page.tsx (restyled)
src/app/admin/events/[id]/modules/page.tsx   new
src/app/admin/events/[id]/actions.ts     + updateModulesAction
src/app/login/page.tsx (restyled)
src/app/scan/[eventId]/page.tsx, Scanner.tsx (restyled)
tests/modules.test.ts, tests/modules-form.test.ts, tests/agenda.test.ts (+), tests/time.test.ts (+)
```

---

### Task 1: Design tokens, font, icon set, UI kit

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Create: `src/components/ui/Icon.tsx`, `src/components/ui/Card.tsx`
- Test: `tests/icon.test.ts`

**Interfaces:**
- Produces: `<Icon name={IconName} size?={number} className?={string} />` with `IconName = "calendar" | "seat" | "map" | "info" | "megaphone" | "mic" | "file" | "chat" | "check" | "phone" | "link" | "home" | "grid" | "user" | "qr" | "chevron" | "search" | "star" | "logout" | "scan" | "users" | "download" | "settings" | "layers" | "flag"`, `ICON_NAMES` array.
- Produces: `Card`, `Stat`, `Pill`, `Button` components.
- CSS custom properties on `:root`: `--canvas`, `--surface`, `--ink`, `--muted`, `--line`, `--brand`, `--brand-ink`, `--brand-soft`, `--radius-card: 16px`, `--radius-control: 10px`. Tailwind theme colours `canvas`, `surface`, `ink`, `muted`, `line`, `brand`, `brand-ink`, `brand-soft` map to them, so `bg-surface`, `text-muted`, `border-line`, `bg-brand` work.

- [ ] **Step 1: Failing test for the icon registry**

`tests/icon.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ICON_NAMES, iconPath } from "@/components/ui/icon-paths";

describe("icons", () => {
  it("has a path for every registered name", () => {
    for (const n of ICON_NAMES) expect(iconPath(n).length).toBeGreaterThan(10);
  });
  it("includes the names the portal and admin rely on", () => {
    for (const n of ["calendar", "seat", "map", "info", "megaphone", "link", "home", "user", "qr", "grid", "scan"]) expect(ICON_NAMES).toContain(n);
  });
});
```

Run: `npx vitest run tests/icon.test.ts` → FAIL (module not found).

- [ ] **Step 2: Icon paths (plain module, no React) and the Icon component**

`src/components/ui/icon-paths.ts`:

```ts
export const ICON_NAMES = [
  "calendar", "seat", "map", "info", "megaphone", "mic", "file", "chat", "check", "phone", "link",
  "home", "grid", "user", "qr", "chevron", "search", "star", "logout", "scan", "users", "download", "settings", "layers", "flag",
] as const;
export type IconName = (typeof ICON_NAMES)[number];

const PATHS: Record<IconName, string> = {
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  seat: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  megaphone: '<path d="M4 11v2a1 1 0 0 0 1 1h2l5 4V6L7 10H5a1 1 0 0 0-1 1z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/><path d="M9 11h6M9 14h4"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.8 2z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14h1v1h-1zM17 20h1v1h-1zM20 18h1v3h-1zM14 20h1v1h-1z"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
  logout: '<path d="M10 17l5-5-5-5M15 12H3M21 3v18"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M3 12h18"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="3"/><path d="M16 15.5a5.5 5.5 0 0 1 5.5 4.5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5M3 17l9 5 9-5"/>',
  flag: '<path d="M5 21V4h11l-1 4 1 4H5"/>',
};

export function iconPath(name: IconName): string { return PATHS[name]; }
```

`src/components/ui/Icon.tsx`:

```tsx
import { iconPath, type IconName } from "./icon-paths";

export function Icon({ name, size = 22, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconPath(name) }} />
  );
}
export type { IconName };
```

Run the test → PASS.

- [ ] **Step 3: Tokens and font**

`src/app/globals.css` (replace whole file):

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

:root {
  color-scheme: light;
  --canvas: #F4F5F7;
  --surface: #FFFFFF;
  --ink: #111827;
  --muted: #6B7280;
  --line: #E5E7EB;
  --brand: #F97316;
  --brand-ink: #C2410C;
  --brand-soft: #FFF1E7;
  --radius-card: 16px;
  --radius-control: 10px;
}

@theme inline {
  --color-canvas: var(--canvas);
  --color-surface: var(--surface);
  --color-ink: var(--ink);
  --color-muted: var(--muted);
  --color-line: var(--line);
  --color-brand: var(--brand);
  --color-brand-ink: var(--brand-ink);
  --color-brand-soft: var(--brand-soft);
  --radius-card: var(--radius-card);
  --radius-control: var(--radius-control);
  --font-sans: var(--font-manrope), "Segoe UI", system-ui, sans-serif;
}

html { background: var(--canvas); }
body { color: var(--ink); font-family: var(--font-sans); -webkit-tap-highlight-color: transparent; }
```

`src/app/layout.tsx` (replace font imports):

```tsx
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = { title: "Orange Lobby", description: "Event portal by Ecopia Events" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: UI kit**

`src/components/ui/Card.tsx`:

```tsx
import Link from "next/link";
import { Icon, type IconName } from "./Icon";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[var(--radius-card)] border border-line bg-surface ${className}`}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="mt-1 text-3xl font-extrabold leading-none">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

export function Pill({ children, tone = "brand" }: { children: React.ReactNode; tone?: "brand" | "ink" | "muted" }) {
  const cls = tone === "brand" ? "bg-brand-soft text-brand-ink" : tone === "ink" ? "bg-ink text-white" : "bg-canvas text-muted";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>{children}</span>;
}

type BtnProps = { children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; className?: string; icon?: IconName };
const btnBase = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 text-sm font-bold transition disabled:opacity-50";
const btnVariant = { primary: "bg-brand text-ink hover:brightness-95", secondary: "border border-line bg-surface text-ink hover:bg-canvas", danger: "border border-red-200 bg-surface text-red-700 hover:bg-red-50" };

export function Button({ children, variant = "primary", className = "", icon, ...rest }: BtnProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`${btnBase} ${btnVariant[variant]} ${className}`} {...rest}>{icon && <Icon name={icon} size={18} />}{children}</button>;
}

export function ButtonLink({ children, href, variant = "primary", className = "", icon }: BtnProps & { href: string }) {
  return <Link href={href} className={`${btnBase} ${btnVariant[variant]} ${className}`}>{icon && <Icon name={icon} size={18} />}{children}</Link>;
}
```

- [ ] **Step 5: Verify and commit**

```bash
npm test && npm run build && npx eslint src
git add -A && git commit -m "feat(ui): design tokens, Manrope, icon set and UI kit

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

The app still renders with the old layouts on new tokens; that is expected.

---

### Task 2: Modules model, migration, and "now/next" helpers

**Files:**
- Create: `src/lib/modules.ts`, `supabase/migrations/0002_modules.sql`
- Modify: `src/lib/types.ts`, `src/lib/agenda.ts`, `src/lib/time.ts`
- Test: `tests/modules.test.ts`, `tests/agenda.test.ts` (append), `tests/time.test.ts` (append)

**Interfaces:**
- `EventModule`, `BuiltinKey`, `BUILTIN_MODULES`, `MODULE_ICONS`, `parseModules(json: string | unknown): EventModule[]` (throws readable Error), `defaultModules(): EventModule[]`, `resolveTiles(input): Tile[]` where `input = { event: Pick<Event,"floor_plan_url"|"info_page_html"|"info_page_title"|"modules">, personal: boolean, basePath: string, attendee?: Pick<Attendee,"table_no"|"seat_no"> | null, next?: { item: AgendaItem; status: "now"|"next" } | null, latestAnnouncement?: string | null }` and `Tile = { id: string; label: string; subtitle: string; href: string; icon: IconName; external: boolean }`.
- `nextSession(items: AgendaItem[], date: string, time: string): { item: AgendaItem; status: "now" | "next" } | null`, `isNow(item, date, time): boolean`.
- `nowInKL(now?: Date): { date: string; time: string }`.
- `Event.modules: EventModule[]`.

- [ ] **Step 1: Failing tests**

`tests/modules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseModules, defaultModules, resolveTiles } from "@/lib/modules";
import type { AgendaItem } from "@/lib/types";

const item = (p: Partial<AgendaItem>): AgendaItem => ({ id: "x", event_id: "e", day: "2026-09-30", starts_at: "10:30", ends_at: "11:15", title: "Year in Review", description: null, location: null, categories: null, sort_order: 0, ...p });

describe("parseModules", () => {
  it("accepts builtins and link tiles, rejects junk", () => {
    const mods = parseModules(JSON.stringify([
      { key: "agenda", enabled: true },
      { key: "link", id: "qa", enabled: true, label: "Q&A", url: "https://app.sli.do/x", icon: "chat" },
    ]));
    expect(mods).toHaveLength(2);
    expect(() => parseModules(JSON.stringify([{ key: "nope", enabled: true }]))).toThrow(/key/);
    expect(() => parseModules(JSON.stringify([{ key: "link", id: "a", enabled: true, label: "X", url: "javascript:alert(1)", icon: "chat" }]))).toThrow(/url/);
    expect(() => parseModules("{")).toThrow(/JSON/);
  });
  it("defaults enable the five builtins in order", () => {
    expect(defaultModules().map((m) => m.key)).toEqual(["agenda", "seat", "floor_plan", "info", "announcements"]);
  });
});

describe("resolveTiles", () => {
  const event = { floor_plan_url: "https://x/plan.png", info_page_html: "<p>hi</p>", info_page_title: "Info", modules: defaultModules() };
  it("shows seat only on personal links and fills subtitles", () => {
    const personal = resolveTiles({ event, personal: true, basePath: "/e/kom/a/tok", attendee: { table_no: "12", seat_no: "3" }, next: { item: item({}), status: "next" }, latestAnnouncement: "Breakouts moved" });
    expect(personal.map((t) => t.id)).toEqual(["agenda", "seat", "floor_plan", "info", "announcements"]);
    expect(personal[0].subtitle).toBe("Next: 10:30 Year in Review");
    expect(personal[1]).toMatchObject({ subtitle: "Table 12 · Seat 3", href: "/e/kom/a/tok/seat" });
    expect(personal[4].subtitle).toBe("Breakouts moved");
    const generic = resolveTiles({ event, personal: false, basePath: "/e/kom" });
    expect(generic.map((t) => t.id)).toEqual(["agenda", "floor_plan", "info", "announcements"]);
    expect(generic[0].subtitle).toBe("Programme");
  });
  it("hides floor plan and info when the event has none, honours disabled and links", () => {
    const tiles = resolveTiles({
      event: { floor_plan_url: null, info_page_html: null, info_page_title: "Info", modules: [
        { key: "agenda", enabled: false }, { key: "floor_plan", enabled: true }, { key: "info", enabled: true },
        { key: "link", id: "qa", enabled: true, label: "Q&A", subtitle: "Ask away", url: "https://app.sli.do/x", icon: "chat" },
      ] },
      personal: true, basePath: "/e/kom/a/tok", attendee: { table_no: null, seat_no: null },
    });
    expect(tiles.map((t) => t.id)).toEqual(["link:qa"]);
    expect(tiles[0]).toMatchObject({ href: "https://app.sli.do/x", external: true, icon: "chat", subtitle: "Ask away" });
  });
  it("labels the info tile with the event's info title and says when seat is unconfirmed", () => {
    const tiles = resolveTiles({ event: { ...event, info_page_title: "Handbook" }, personal: true, basePath: "/p", attendee: { table_no: null, seat_no: null } });
    expect(tiles.find((t) => t.id === "info")?.label).toBe("Handbook");
    expect(tiles.find((t) => t.id === "seat")?.subtitle).toBe("To be confirmed");
  });
});
```

Append to `tests/agenda.test.ts`:

```ts
import { nextSession, isNow } from "@/lib/agenda";

describe("nextSession", () => {
  const items = [
    mk({ id: "a", day: "2026-09-30", starts_at: "09:00", ends_at: "09:45" }),
    mk({ id: "b", day: "2026-09-30", starts_at: "10:30", ends_at: "11:15" }),
    mk({ id: "c", day: "2026-10-01", starts_at: "09:00", ends_at: null }),
  ];
  it("returns the running session as now", () => {
    expect(nextSession(items, "2026-09-30", "10:40")).toMatchObject({ item: { id: "b" }, status: "now" });
    expect(isNow(items[1], "2026-09-30", "10:40")).toBe(true);
  });
  it("returns the next upcoming session across days", () => {
    expect(nextSession(items, "2026-09-30", "09:50")).toMatchObject({ item: { id: "b" }, status: "next" });
    expect(nextSession(items, "2026-09-30", "12:00")).toMatchObject({ item: { id: "c" }, status: "next" });
  });
  it("treats a session without end time as one hour long and returns null after the last one", () => {
    expect(nextSession(items, "2026-10-01", "09:30")?.status).toBe("now");
    expect(nextSession(items, "2026-10-01", "10:30")).toBeNull();
  });
});
```

Append to `tests/time.test.ts`:

```ts
import { nowInKL } from "@/lib/time";

describe("nowInKL", () => {
  it("converts an instant to a Kuala Lumpur date and HH:MM", () => {
    expect(nowInKL(new Date("2026-09-30T02:05:00Z"))).toEqual({ date: "2026-09-30", time: "10:05" });
    expect(nowInKL(new Date("2026-09-30T17:30:00Z"))).toEqual({ date: "2026-10-01", time: "01:30" });
  });
});
```

Run: `npx vitest run tests/modules.test.ts tests/agenda.test.ts tests/time.test.ts` → FAIL.

- [ ] **Step 2: Implement**

`src/lib/modules.ts`:

```ts
import { z } from "zod";
import type { AgendaItem, Attendee, Event } from "@/lib/types";
import type { IconName } from "@/components/ui/icon-paths";

export const BUILTIN_MODULES = ["agenda", "seat", "floor_plan", "info", "announcements"] as const;
export type BuiltinKey = (typeof BUILTIN_MODULES)[number];
export const MODULE_ICONS = ["calendar", "seat", "map", "info", "megaphone", "mic", "file", "chat", "check", "phone", "link", "star", "users", "download"] as const satisfies readonly IconName[];
export type ModuleIcon = (typeof MODULE_ICONS)[number];

export type BuiltinModule = { key: BuiltinKey; enabled: boolean; label?: string; subtitle?: string };
export type LinkModule = { key: "link"; id: string; enabled: boolean; label: string; subtitle?: string; url: string; icon: ModuleIcon };
export type EventModule = BuiltinModule | LinkModule;

const SAFE_URL = /^https?:\/\//i;
const builtinSchema = z.object({ key: z.enum(BUILTIN_MODULES), enabled: z.boolean(), label: z.string().min(1).max(40).optional(), subtitle: z.string().max(60).optional() });
const linkSchema = z.object({
  key: z.literal("link"), id: z.string().regex(/^[a-z0-9_-]{1,32}$/), enabled: z.boolean(),
  label: z.string().min(1).max(40), subtitle: z.string().max(60).optional(),
  url: z.string().regex(SAFE_URL, "url must start with http:// or https://"), icon: z.enum(MODULE_ICONS),
});
const moduleSchema = z.discriminatedUnion("key", [
  ...BUILTIN_MODULES.map((k) => builtinSchema.extend({ key: z.literal(k) })),
  linkSchema,
] as unknown as [z.ZodDiscriminatedUnionOption<"key">, ...z.ZodDiscriminatedUnionOption<"key">[]]);

export function parseModules(input: string | unknown): EventModule[] {
  let raw: unknown = input;
  if (typeof input === "string") {
    try { raw = JSON.parse(input); } catch { throw new Error("Modules must be valid JSON"); }
  }
  const res = z.array(moduleSchema).max(12).safeParse(raw);
  if (!res.success) {
    const i = res.error.issues[0];
    const field = String(i.path[i.path.length - 1] ?? "key");
    throw new Error(`Module ${String(i.path[0] ?? "?")}: ${field} — ${i.message}`);
  }
  return res.data as EventModule[];
}

export function defaultModules(): EventModule[] {
  return BUILTIN_MODULES.map((key) => ({ key, enabled: true }));
}

const DEFAULT_LABEL: Record<BuiltinKey, string> = { agenda: "Agenda", seat: "My seat", floor_plan: "Floor plan", info: "Info", announcements: "Announcements" };
const DEFAULT_ICON: Record<BuiltinKey, ModuleIcon> = { agenda: "calendar", seat: "seat", floor_plan: "map", info: "info", announcements: "megaphone" };

export type Tile = { id: string; label: string; subtitle: string; href: string; icon: ModuleIcon; external: boolean };

export function resolveTiles(input: {
  event: Pick<Event, "floor_plan_url" | "info_page_html" | "info_page_title" | "modules">;
  personal: boolean; basePath: string;
  attendee?: Pick<Attendee, "table_no" | "seat_no"> | null;
  next?: { item: AgendaItem; status: "now" | "next" } | null;
  latestAnnouncement?: string | null;
}): Tile[] {
  const { event, personal, basePath, attendee, next, latestAnnouncement } = input;
  const modules = event.modules?.length ? event.modules : defaultModules();
  const out: Tile[] = [];
  for (const m of modules) {
    if (!m.enabled) continue;
    if (m.key === "link") { out.push({ id: `link:${m.id}`, label: m.label, subtitle: m.subtitle ?? "", href: m.url, icon: m.icon, external: true }); continue; }
    const label = m.label ?? (m.key === "info" ? event.info_page_title || DEFAULT_LABEL.info : DEFAULT_LABEL[m.key]);
    const icon = DEFAULT_ICON[m.key];
    switch (m.key) {
      case "agenda":
        out.push({ id: "agenda", label, icon, external: false, href: `${basePath}/agenda`,
          subtitle: m.subtitle ?? (next ? `${next.status === "now" ? "Now" : "Next"}: ${next.item.starts_at} ${next.item.title}` : "Programme") });
        break;
      case "seat":
        if (!personal) break;
        out.push({ id: "seat", label, icon, external: false, href: `${basePath}/seat`,
          subtitle: m.subtitle ?? (attendee?.table_no ? `Table ${attendee.table_no}${attendee.seat_no ? ` · Seat ${attendee.seat_no}` : ""}` : "To be confirmed") });
        break;
      case "floor_plan":
        if (!event.floor_plan_url) break;
        out.push({ id: "floor_plan", label, icon, external: false, href: `${basePath}/plan`, subtitle: m.subtitle ?? "Venue layout" });
        break;
      case "info":
        if (!event.info_page_html) break;
        out.push({ id: "info", label, icon, external: false, href: `${basePath}/info`, subtitle: m.subtitle ?? "Everything you need to know" });
        break;
      case "announcements":
        out.push({ id: "announcements", label, icon, external: false, href: `${basePath}/announcements`, subtitle: m.subtitle ?? latestAnnouncement ?? "No announcements yet" });
        break;
    }
  }
  return out;
}
```

If the discriminated-union cast is rejected by zod 4's types, replace `moduleSchema` with `z.union([builtinSchema, linkSchema])` and keep the tests as the contract.

Append to `src/lib/agenda.ts`:

```ts
function endOf(i: AgendaItem): string {
  if (i.ends_at) return i.ends_at;
  const [h, m] = i.starts_at.split(":").map(Number);
  return `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isNow(i: AgendaItem, date: string, time: string): boolean {
  return i.day === date && i.starts_at <= time && time < endOf(i);
}

export function nextSession(items: AgendaItem[], date: string, time: string): { item: AgendaItem; status: "now" | "next" } | null {
  const sorted = groupByDay(items).flatMap((d) => d.items);
  const now = sorted.find((i) => isNow(i, date, time));
  if (now) return { item: now, status: "now" };
  const next = sorted.find((i) => i.day > date || (i.day === date && i.starts_at > time));
  return next ? { item: next, status: "next" } : null;
}
```

Append to `src/lib/time.ts`:

```ts
export function nowInKL(now: Date = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: MY_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
}
```

`src/lib/types.ts`: add `import type { EventModule } from "@/lib/modules";` and `modules: EventModule[];` to `Event`. (`modules.ts` imports only types from `types.ts`, so the cycle is type-only and fine.)

`supabase/migrations/0002_modules.sql`:

```sql
alter table events add column if not exists modules jsonb not null default '[]'::jsonb;
```

Run the three test files → PASS. Then `npm test`.

- [ ] **Step 3: Apply the migration to the live project**

Use the Supabase connector: `apply_migration` with `project_id: wfmqwwcolfigjylkgrsv`, `name: modules`, `query` = the file's contents. Then `list_tables` (verbose) or `execute_sql` `select column_name from information_schema.columns where table_name='events' and column_name='modules'` to confirm.

- [ ] **Step 4: Build, lint, commit**

```bash
npm run build && npx eslint src
git add -A && git commit -m "feat(modules): event module model, now/next helpers, modules column

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Admin modules editor

**Files:**
- Create: `src/lib/modules-form.ts`, `src/app/admin/events/[id]/modules/page.tsx`
- Modify: `src/app/admin/events/[id]/actions.ts`, `src/lib/db/events.ts` (no change needed if `updateEvent` accepts `modules`; confirm the `Partial<Event>` patch type includes it — it does once `Event.modules` exists)
- Test: `tests/modules-form.test.ts`

**Interfaces:**
- `modulesFromForm(get: (key: string) => string | null): EventModule[]`. Field names: builtin `mod_<key>_enabled` ("on"), `mod_<key>_label`, `mod_<key>_subtitle`; links 1–4: `link_<n>_enabled`, `link_<n>_label`, `link_<n>_subtitle`, `link_<n>_url`, `link_<n>_icon`. A link row with a blank label and blank url is skipped. Link ids are `l<n>`.
- Action: `updateModulesAction(eventId, formData)` → redirects to `/admin/events/[id]/modules?saved=1` or `?error=`.

- [ ] **Step 1: Failing test**

`tests/modules-form.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { modulesFromForm } from "@/lib/modules-form";

const form = (o: Record<string, string>) => (k: string) => o[k] ?? null;

describe("modulesFromForm", () => {
  it("keeps builtin order, reads toggles and overrides, and appends filled link rows", () => {
    const mods = modulesFromForm(form({
      mod_agenda_enabled: "on", mod_seat_enabled: "on", mod_info_enabled: "on", mod_info_label: "Handbook",
      link_1_enabled: "on", link_1_label: "Q&A", link_1_url: "https://app.sli.do/x", link_1_icon: "chat", link_1_subtitle: "Ask the directors",
      link_2_label: "", link_2_url: "",
    }));
    expect(mods.map((m) => m.key)).toEqual(["agenda", "seat", "floor_plan", "info", "announcements", "link"]);
    expect(mods[2]).toMatchObject({ key: "floor_plan", enabled: false });
    expect(mods[3]).toMatchObject({ key: "info", enabled: true, label: "Handbook" });
    expect(mods[5]).toMatchObject({ key: "link", id: "l1", enabled: true, label: "Q&A", url: "https://app.sli.do/x", icon: "chat", subtitle: "Ask the directors" });
  });
  it("throws a readable error for a bad link url", () => {
    expect(() => modulesFromForm(form({ link_1_enabled: "on", link_1_label: "Bad", link_1_url: "ftp://x", link_1_icon: "chat" }))).toThrow(/url/);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement**

`src/lib/modules-form.ts`:

```ts
import { BUILTIN_MODULES, parseModules, type EventModule } from "@/lib/modules";

export const MAX_LINK_TILES = 4;

export function modulesFromForm(get: (key: string) => string | null): EventModule[] {
  const t = (k: string) => (get(k) ?? "").trim();
  const raw: unknown[] = BUILTIN_MODULES.map((key) => ({
    key, enabled: get(`mod_${key}_enabled`) === "on",
    ...(t(`mod_${key}_label`) ? { label: t(`mod_${key}_label`) } : {}),
    ...(t(`mod_${key}_subtitle`) ? { subtitle: t(`mod_${key}_subtitle`) } : {}),
  }));
  for (let n = 1; n <= MAX_LINK_TILES; n++) {
    const label = t(`link_${n}_label`), url = t(`link_${n}_url`);
    if (!label && !url) continue;
    raw.push({ key: "link", id: `l${n}`, enabled: get(`link_${n}_enabled`) === "on", label, url, icon: t(`link_${n}_icon`) || "link",
      ...(t(`link_${n}_subtitle`) ? { subtitle: t(`link_${n}_subtitle`) } : {}) });
  }
  return parseModules(raw);
}
```

Append to `src/app/admin/events/[id]/actions.ts`:

```ts
import { modulesFromForm } from "@/lib/modules-form";

export async function updateModulesAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  let modules;
  try { modules = modulesFromForm((k) => { const v = formData.get(k); return typeof v === "string" ? v : null; }); }
  catch (e) { redirect(`/admin/events/${eventId}/modules?error=${encodeURIComponent((e as Error).message)}`); }
  await updateEvent(eventId, { modules });
  revalidatePath(`/admin/events/${eventId}`);
  redirect(`/admin/events/${eventId}/modules?saved=1`);
}
```

`src/app/admin/events/[id]/modules/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { BUILTIN_MODULES, MODULE_ICONS, defaultModules, type LinkModule } from "@/lib/modules";
import { MAX_LINK_TILES } from "@/lib/modules-form";
import { Card, Button } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { updateModulesAction } from "../actions";

const NAMES: Record<(typeof BUILTIN_MODULES)[number], { label: string; help: string }> = {
  agenda: { label: "Agenda", help: "Programme by day. Subtitle shows the next session automatically." },
  seat: { label: "My seat", help: "Personal links only. Shows table and seat from the attendee record." },
  floor_plan: { label: "Floor plan", help: "Shown only when the event has a floor plan image URL." },
  info: { label: "Info page", help: "Shown only when the info page has content. Label defaults to the page title." },
  announcements: { label: "Announcements", help: "Subtitle shows the latest announcement." },
};

export default async function ModulesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params; const { saved, error } = await searchParams;
  const { orgId } = await requireAdmin(); const ev = await requireEvent(id, orgId);
  const mods = ev.modules?.length ? ev.modules : defaultModules();
  const builtin = (k: string) => mods.find((m) => m.key === k && m.key !== "link") as { enabled: boolean; label?: string; subtitle?: string } | undefined;
  const links = mods.filter((m): m is LinkModule => m.key === "link");
  const input = "w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-sm";
  return (
    <form action={updateModulesAction.bind(null, ev.id)} className="max-w-3xl space-y-4">
      {saved && <p className="rounded-[var(--radius-control)] bg-green-50 p-3 text-sm text-green-800">Saved.</p>}
      {error && <p className="rounded-[var(--radius-control)] bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Card className="divide-y divide-line">
        {BUILTIN_MODULES.map((key) => { const m = builtin(key); return (
          <div key={key} className="grid gap-3 p-4 md:grid-cols-[auto_1fr_1fr]">
            <label className="flex min-w-48 items-start gap-3 text-sm">
              <input type="checkbox" name={`mod_${key}_enabled`} defaultChecked={m?.enabled ?? true} className="mt-1 size-4 accent-[var(--brand)]" />
              <span><span className="block font-bold">{NAMES[key].label}</span><span className="block text-xs text-muted">{NAMES[key].help}</span></span>
            </label>
            <input name={`mod_${key}_label`} defaultValue={m?.label ?? ""} placeholder="Custom label (optional)" className={input} />
            <input name={`mod_${key}_subtitle`} defaultValue={m?.subtitle ?? ""} placeholder="Custom subtitle (optional)" className={input} />
          </div>
        ); })}
      </Card>
      <Card className="divide-y divide-line">
        <div className="p-4"><div className="font-bold">Link tiles</div><div className="text-xs text-muted">Up to {MAX_LINK_TILES} tiles that open an external page: Slido Q&amp;A, a feedback form, a documents folder.</div></div>
        {Array.from({ length: MAX_LINK_TILES }, (_, i) => i + 1).map((n) => { const l = links[n - 1]; return (
          <div key={n} className="grid gap-3 p-4 md:grid-cols-[auto_1fr_1fr]">
            <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" name={`link_${n}_enabled`} defaultChecked={l?.enabled ?? true} className="size-4 accent-[var(--brand)]" /> Tile {n}</label>
            <input name={`link_${n}_label`} defaultValue={l?.label ?? ""} placeholder="Label" className={input} />
            <input name={`link_${n}_subtitle`} defaultValue={l?.subtitle ?? ""} placeholder="Subtitle (optional)" className={input} />
            <div />
            <input name={`link_${n}_url`} defaultValue={l?.url ?? ""} placeholder="https://" className={input} />
            <select name={`link_${n}_icon`} defaultValue={l?.icon ?? "link"} className={input}>{MODULE_ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}</select>
          </div>
        ); })}
      </Card>
      <div className="flex items-center gap-3"><Button type="submit">Save modules</Button><span className="flex items-center gap-1 text-xs text-muted"><Icon name="info" size={14} /> Tiles appear on the portal home in this order.</span></div>
    </form>
  );
}
```

- [ ] **Step 3: Verify, browser check, commit**

Run tests, build, lint. In the browser (signed in as admin): open `/admin/events/<id>/modules` for the test event, add a link tile "Q&A" with a Slido URL, save, confirm `events.modules` in the database via `execute_sql`. Commit `feat(admin): modules editor`.

---

### Task 4: Portal shell, home, Me page, plan page

**Files:**
- Rewrite: `src/components/portal/PortalShell.tsx`
- Create: `src/components/portal/MeCard.tsx`, `src/components/portal/TileGrid.tsx`, `src/components/portal/AnnouncementBanner.tsx`, `src/lib/portal-home.ts`, `src/app/e/[slug]/a/[token]/me/page.tsx`, `src/app/e/[slug]/plan/page.tsx`, `src/app/e/[slug]/a/[token]/plan/page.tsx`
- Rewrite: `src/app/e/[slug]/page.tsx`, `src/app/e/[slug]/a/[token]/page.tsx`
- Delete: `src/components/portal/EventInfoCard.tsx` (its content moves to the Me page and Info page header)

**Interfaces:**
- `PortalShell` props: `{ event, basePath, personal, title?: string, back?: boolean, children }`. Renders header (logo or initials mark, name, dates · venue), content, bottom bar. Draft gate unchanged in behaviour.
- `loadHomeData(event, attendee | null)` in `src/lib/portal-home.ts` returns `{ tiles, banner }` where `banner` is the pinned or latest announcement or null. Server-only.
- `initials(name: string): string` in `src/lib/portal-home.ts`? No — put `initials` in `src/lib/slug.ts`? Keep it in `src/lib/text.ts` (new, pure): `initials("Ecopia Kick-Off Meeting 2026") === "EK"`, `formatDateRange(starts, ends)` → `"30 Sep – 1 Oct 2026"` / `"30 Sep 2026"` / `""`. Test in `tests/text.test.ts`.

- [ ] **Step 1: Failing text-helper tests**

`tests/text.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { initials, formatDateRange } from "@/lib/text";

describe("text helpers", () => {
  it("initials take the first two words, uppercase", () => {
    expect(initials("Ecopia Kick-Off Meeting 2026")).toBe("EK");
    expect(initials("Aiman")).toBe("A");
    expect(initials("  ")).toBe("?");
  });
  it("formats date ranges in Malaysia style", () => {
    expect(formatDateRange("2026-09-30", "2026-10-01")).toBe("30 Sep – 1 Oct 2026");
    expect(formatDateRange("2026-09-30", "2026-09-30")).toBe("30 Sep 2026");
    expect(formatDateRange("2026-09-30", null)).toBe("30 Sep 2026");
    expect(formatDateRange(null, null)).toBe("");
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement helpers**

`src/lib/text.ts`:

```ts
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

const fmt = (d: string, withYear: boolean) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });

export function formatDateRange(starts: string | null, ends: string | null): string {
  if (!starts && !ends) return "";
  const a = starts ?? ends!, b = ends ?? starts!;
  if (a === b) return fmt(a, true);
  return `${fmt(a, false)} – ${fmt(b, true)}`;
}
```

Run → PASS.

- [ ] **Step 3: Shell and home components**

`src/components/portal/PortalShell.tsx`:

```tsx
import Link from "next/link";
import type { Event } from "@/lib/types";
import { Icon, type IconName } from "@/components/ui/Icon";
import { initials, formatDateRange } from "@/lib/text";

type NavItem = { href: string; label: string; icon: IconName };
const nav = (personal: boolean): NavItem[] => [
  { href: "", label: "Home", icon: "grid" },
  { href: "/agenda", label: "Agenda", icon: "calendar" },
  personal ? { href: "/me", label: "Me", icon: "user" } : { href: "/info", label: "Info", icon: "info" },
];

function Mark({ event }: { event: Event }) {
  if (event.logo_url) return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={event.logo_url} alt="" className="h-10 w-10 rounded-[10px] object-contain" />
  );
  return <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand text-sm font-extrabold text-white">{initials(event.name)}</div>;
}

export function PortalShell({ event, basePath, personal, current = "", children }: { event: Event; basePath: string; personal: boolean; current?: "" | "/agenda" | "/me" | "/info"; children: React.ReactNode }) {
  const style = { ["--brand" as string]: event.primary_color } as React.CSSProperties;
  const meta = [formatDateRange(event.starts_on, event.ends_on), event.venue_name].filter(Boolean).join(" · ");
  if (event.status === "draft") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center p-6" style={style}>
        <div className="w-full rounded-[var(--radius-card)] border border-line bg-surface p-6 text-center">
          <div className="mx-auto mb-4 w-fit"><Mark event={event} /></div>
          <h1 className="text-xl font-extrabold">{event.name}</h1>
          {meta && <p className="mt-1 text-sm text-muted">{meta}</p>}
          <p className="mt-4 text-sm text-muted">Coming soon. Check back closer to the event.</p>
        </div>
      </main>
    );
  }
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-canvas" style={style}>
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-4">
        <Link href={basePath || "/"} aria-label="Home"><Mark event={event} /></Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-extrabold leading-tight">{event.name}</div>
          {meta && <div className="truncate text-xs font-medium text-muted">{meta}</div>}
        </div>
      </header>
      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>
      <nav className="fixed bottom-0 left-1/2 flex w-full max-w-md -translate-x-1/2 justify-around border-t border-line bg-surface px-2 py-2">
        {nav(personal).map((n) => {
          const active = n.href === current;
          return (
            <Link key={n.href} href={`${basePath}${n.href}`} className={`flex min-h-11 min-w-16 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "font-bold text-brand-ink" : "font-semibold text-muted"}`}>
              <Icon name={n.icon} size={22} /><span>{n.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

`src/components/portal/MeCard.tsx`:

```tsx
import Link from "next/link";
import type { Attendee } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";

export function MeCard({ attendee, basePath }: { attendee: Attendee; basePath: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-card)] bg-ink p-4 text-white">
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-extrabold">Hi {attendee.name.split(" ")[0]}</div>
        {attendee.company && <div className="truncate text-xs text-gray-400">{attendee.company}</div>}
      </div>
      {attendee.table_no && <span className="rounded-[8px] bg-brand px-2.5 py-1.5 text-sm font-extrabold text-ink">Table {attendee.table_no}</span>}
      <Link href={`${basePath}/me`} aria-label="My QR code" className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-white text-ink"><Icon name="qr" size={22} /></Link>
    </div>
  );
}
```

`src/components/portal/AnnouncementBanner.tsx`:

```tsx
import Link from "next/link";
import type { Announcement } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";
import { MY_TZ } from "@/lib/time";

export function AnnouncementBanner({ a, href }: { a: Announcement; href: string }) {
  const when = new Date(a.created_at).toLocaleString("en-MY", { timeZone: MY_TZ, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  return (
    <Link href={href} className="flex items-center gap-3 rounded-[12px] border border-[#FED7AA] bg-brand-soft px-3.5 py-3">
      <Icon name="megaphone" size={20} className="shrink-0 text-brand-ink" />
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-[#7C2D12]">{a.title}</div><div className="text-xs text-[#9A3412]">{when}</div></div>
      <Icon name="chevron" size={18} className="text-brand-ink" />
    </Link>
  );
}
```

`src/components/portal/TileGrid.tsx`:

```tsx
import Link from "next/link";
import type { Tile } from "@/lib/modules";
import { Icon } from "@/components/ui/Icon";

function TileBody({ t }: { t: Tile }) {
  return (
    <>
      <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand-soft text-brand-ink"><Icon name={t.icon} size={22} /></div>
      <div><div className="text-[15px] font-extrabold">{t.label}</div>{t.subtitle && <div className="line-clamp-2 text-xs text-muted">{t.subtitle}</div>}</div>
    </>
  );
}

export function TileGrid({ tiles }: { tiles: Tile[] }) {
  if (tiles.length === 0) return <p className="text-sm text-muted">Nothing to show yet.</p>;
  const cls = "flex min-h-[108px] flex-col justify-between gap-2.5 rounded-[var(--radius-card)] border border-line bg-surface p-4";
  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map((t) => t.external
        ? <a key={t.id} href={t.href} target="_blank" rel="noopener noreferrer" className={cls}><TileBody t={t} /></a>
        : <Link key={t.id} href={t.href} className={cls}><TileBody t={t} /></Link>)}
    </div>
  );
}
```

`src/lib/portal-home.ts`:

```ts
import "server-only";
import { listAgenda } from "@/lib/db/agenda";
import { listAnnouncements } from "@/lib/db/announcements";
import { visibleTo, nextSession } from "@/lib/agenda";
import { nowInKL } from "@/lib/time";
import { resolveTiles, type Tile } from "@/lib/modules";
import type { Announcement, Attendee, Event } from "@/lib/types";

export async function loadHomeData(event: Event, attendee: Attendee | null, basePath: string): Promise<{ tiles: Tile[]; banner: Announcement | null }> {
  const [agenda, announcements] = await Promise.all([listAgenda(event.id), listAnnouncements(event.id)]);
  const { date, time } = nowInKL();
  const next = nextSession(visibleTo(agenda, attendee?.category ?? null), date, time);
  const banner = announcements.find((a) => a.pinned) ?? announcements[0] ?? null;
  const tiles = resolveTiles({ event, personal: !!attendee, basePath, attendee, next, latestAnnouncement: banner?.title ?? null });
  return { tiles, banner };
}
```

- [ ] **Step 4: Home, Me and plan pages**

`src/app/e/[slug]/a/[token]/page.tsx`:

```tsx
import { loadPortalAttendee } from "@/lib/portal";
import { loadHomeData } from "@/lib/portal-home";
import { PortalShell } from "@/components/portal/PortalShell";
import { MeCard } from "@/components/portal/MeCard";
import { AnnouncementBanner } from "@/components/portal/AnnouncementBanner";
import { TileGrid } from "@/components/portal/TileGrid";

export default async function PersonalHome({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const basePath = `/e/${slug}/a/${token}`;
  const { tiles, banner } = await loadHomeData(event, attendee, basePath);
  return (
    <PortalShell event={event} basePath={basePath} personal current="">
      <div className="flex flex-col gap-3.5">
        <MeCard attendee={attendee} basePath={basePath} />
        {banner && <AnnouncementBanner a={banner} href={`${basePath}/announcements`} />}
        <TileGrid tiles={tiles} />
      </div>
    </PortalShell>
  );
}
```

`src/app/e/[slug]/page.tsx`: same without `MeCard`, `loadPortalEvent(slug)`, `loadHomeData(event, null, `/e/${slug}`)`, `personal={false}`.

`src/app/e/[slug]/a/[token]/me/page.tsx`:

```tsx
import { loadPortalAttendee } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";
import { appBaseUrl, attendeeLink } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";
import { Pill } from "@/components/ui/Card";

export default async function MePage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const basePath = `/e/${slug}/a/${token}`;
  const qr = await qrDataUrl(attendeeLink(appBaseUrl(), slug, attendee.token));
  return (
    <PortalShell event={event} basePath={basePath} personal current="/me">
      <div className="flex flex-col gap-3.5">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Your QR code" className="mx-auto w-52 rounded-[10px]" />
          <div className="mt-3 text-xl font-extrabold">{attendee.name}</div>
          {attendee.company && <div className="text-sm text-muted">{attendee.company}</div>}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {attendee.category && <Pill tone="muted">{attendee.category}</Pill>}
            {attendee.table_no && <Pill>Table {attendee.table_no}{attendee.seat_no ? ` · Seat ${attendee.seat_no}` : ""}</Pill>}
          </div>
          <p className="mt-3 text-xs text-muted">Show this at check-in if you do not have your badge.</p>
        </div>
        {(event.contact_name || event.contact_phone) && (
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Need help?</div>
            <div className="mt-1 font-bold">{event.contact_name}</div>
            {event.contact_phone && <a className="text-brand-ink" href={`tel:${event.contact_phone}`}>{event.contact_phone}</a>}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
```

`src/app/e/[slug]/plan/page.tsx` (generic) and `src/app/e/[slug]/a/[token]/plan/page.tsx` (personal): floor plan image full width inside a card; personal variant shows a top strip "You are at Table X" when `table_no` is set. If `floor_plan_url` is null, `notFound()`.

```tsx
// personal variant
import { notFound } from "next/navigation";
import { loadPortalAttendee } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";

export default async function PlanPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  if (!event.floor_plan_url) notFound();
  return (
    <PortalShell event={event} basePath={`/e/${slug}/a/${token}`} personal current="">
      <h1 className="mb-3 text-xl font-extrabold">Floor plan</h1>
      {attendee.table_no && <div className="mb-3 rounded-[12px] bg-ink px-4 py-3 text-sm font-bold text-white">You are at Table {attendee.table_no}{attendee.seat_no ? `, Seat ${attendee.seat_no}` : ""}</div>}
      <div className="overflow-auto rounded-[var(--radius-card)] border border-line bg-surface p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={event.floor_plan_url} alt="Floor plan" className="w-full" />
      </div>
    </PortalShell>
  );
}
```

Delete `EventInfoCard.tsx`; move venue/address/map/description into the Info page header in Task 5.

- [ ] **Step 5: Verify, browser check, commit**

Tests, build, lint. Browser on the test event: personal home shows the Me card, a banner if any announcement exists, and tiles; generic home has no Me card and no seat tile; `/me` shows the QR; `/plan` 404s when no floor plan URL. Commit `feat(portal): tile-grid home, Me page, plan page`.

---

### Task 5: Agenda, announcements, info, seat pages

**Files:**
- Rewrite: `src/components/portal/AgendaList.tsx`, `src/components/portal/AnnouncementList.tsx`
- Modify: the six agenda/announcements/info pages (generic + personal), `src/app/e/[slug]/a/[token]/seat/page.tsx`
- Test: none new beyond `isNow` (Task 2); `pickDay` is tested in `tests/agenda.test.ts` (append).

**Interfaces:**
- `pickDay(days: string[], requested: string | undefined, today: string): string | null` in `src/lib/agenda.ts`: returns `requested` if listed, else `today` if listed, else the first day, `null` for empty.
- `AgendaList` props: `{ items: AgendaItem[]; day: string; days: string[]; basePath: string; now: { date: string; time: string } }` renders day tabs as links `?day=YYYY-MM-DD`, then cards for the chosen day with a "Now" state.

- [ ] **Step 1: Failing `pickDay` test** (append to `tests/agenda.test.ts`)

```ts
import { pickDay } from "@/lib/agenda";
describe("pickDay", () => {
  const days = ["2026-09-30", "2026-10-01"];
  it("prefers the requested day, then today, then the first", () => {
    expect(pickDay(days, "2026-10-01", "2026-09-30")).toBe("2026-10-01");
    expect(pickDay(days, "2026-12-25", "2026-10-01")).toBe("2026-10-01");
    expect(pickDay(days, undefined, "2026-01-01")).toBe("2026-09-30");
    expect(pickDay([], undefined, "2026-01-01")).toBeNull();
  });
});
```

- [ ] **Step 2: Implement `pickDay` and the components**

Append to `src/lib/agenda.ts`:

```ts
export function pickDay(days: string[], requested: string | undefined, today: string): string | null {
  if (days.length === 0) return null;
  if (requested && days.includes(requested)) return requested;
  if (days.includes(today)) return today;
  return days[0];
}
```

`src/components/portal/AgendaList.tsx`:

```tsx
import Link from "next/link";
import type { AgendaItem } from "@/lib/types";
import { isNow } from "@/lib/agenda";
import { Pill } from "@/components/ui/Card";

const dayLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

export function AgendaList({ items, day, days, basePath, now }: { items: AgendaItem[]; day: string | null; days: string[]; basePath: string; now: { date: string; time: string } }) {
  if (!day) return <p className="text-sm text-muted">Agenda will be published soon.</p>;
  const todays = items.filter((i) => i.day === day);
  return (
    <div className="flex flex-col gap-3">
      {days.length > 1 && (
        <div className="flex gap-5 border-b border-line">
          {days.map((d) => (
            <Link key={d} href={`${basePath}/agenda?day=${d}`} className={`-mb-px border-b-[3px] pb-2 text-[13px] ${d === day ? "border-brand font-extrabold text-brand-ink" : "border-transparent font-semibold text-muted"}`}>{dayLabel(d)}</Link>
          ))}
        </div>
      )}
      {todays.map((i) => {
        const live = isNow(i, now.date, now.time);
        return (
          <div key={i.id} className={`flex gap-3 rounded-[14px] bg-surface p-3.5 ${live ? "border-2 border-brand" : "border border-line"}`}>
            <div className="w-11 shrink-0">
              <div className={`text-[13px] font-extrabold ${live ? "text-brand-ink" : "text-muted"}`}>{i.starts_at}</div>
              {live ? <div className="text-[10px] font-extrabold tracking-[0.08em] text-brand-ink">NOW</div> : i.ends_at && <div className="text-[10px] text-muted">{i.ends_at}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold">{i.title}</div>
              {i.location && <div className="text-xs text-muted">{i.location}</div>}
              {i.description && <p className="mt-1 whitespace-pre-line text-sm text-muted">{i.description}</p>}
              {i.categories && i.categories.length > 0 && <div className="mt-1.5"><Pill>{i.categories.join(", ")}</Pill></div>}
            </div>
          </div>
        );
      })}
      {todays.length === 0 && <p className="text-sm text-muted">Nothing scheduled on this day.</p>}
    </div>
  );
}
```

Agenda pages (generic and personal) become:

```tsx
import { loadPortalAttendee } from "@/lib/portal";
import { listAgenda } from "@/lib/db/agenda";
import { visibleTo, groupByDay, pickDay } from "@/lib/agenda";
import { nowInKL } from "@/lib/time";
import { PortalShell } from "@/components/portal/PortalShell";
import { AgendaList } from "@/components/portal/AgendaList";

export default async function PersonalAgenda({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ day?: string }> }) {
  const { slug, token } = await params; const { day: requested } = await searchParams;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const basePath = `/e/${slug}/a/${token}`;
  const items = visibleTo(await listAgenda(event.id), attendee.category);
  const days = groupByDay(items).map((d) => d.day);
  const now = nowInKL();
  const day = pickDay(days, requested, now.date);
  return (
    <PortalShell event={event} basePath={basePath} personal current="/agenda">
      <h1 className="mb-3 text-xl font-extrabold">Agenda</h1>
      <AgendaList items={items} day={day} days={days} basePath={basePath} now={now} />
    </PortalShell>
  );
}
```

(Generic: `loadPortalEvent`, `visibleTo(items, null)`, `personal={false}`, `basePath` `/e/${slug}`.)

`src/components/portal/AnnouncementList.tsx`: cards with the same 14px radius, pinned ones get `border-brand` and a "Pinned" `Pill`, timestamps via `MY_TZ` as today.

Info pages: header block (venue name, address, map link as a `ButtonLink` secondary with `map` icon, description, contact) followed by the sanitised HTML in `prose prose-sm`. This replaces the deleted `EventInfoCard`.

Seat page: keep behaviour; restyle the table card as `bg-ink` with `text-brand` table number (`text-6xl font-extrabold`), seat below, and a `ButtonLink` to `/plan` when a floor plan exists.

- [ ] **Step 3: Verify, browser check, commit**

Tests, build, lint. Browser: agenda day tabs switch via `?day=`, the running session (adjust the test agenda item's time to now in the admin) shows NOW, info page shows venue and HTML, seat page shows the table. Commit `feat(portal): agenda tabs and restyled content pages`.

---

### Task 6: Registration, confirmation, error pages

**Files:**
- Modify: `src/app/e/[slug]/register/page.tsx`, `RegisterForm.tsx`, `done/page.tsx`, `src/app/e/[slug]/not-found.tsx`, `error.tsx`, `src/app/not-found.tsx`

- [ ] **Step 1: Restyle**

Registration page: use the same header as `PortalShell` (extract `PortalHeader` from the shell into `src/components/portal/PortalHeader.tsx` and reuse it in both, no bottom bar on registration). Form controls: `min-h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-base`; question labels `text-sm font-bold`, descriptions `text-xs text-muted`; submit is the `Button` primary full width. Closed state is a `Card` with the message. Done page: card with the QR, first-name greeting, `Pill` for the link, and a secondary `ButtonLink` "Open my event page" to the personal link. Error and not-found: `Card` centred with an `Icon name="info"` and the existing copy; the error page keeps `retry`.

- [ ] **Step 2: Verify, browser check, commit**

Submit a registration on the test event with a `+test` email, confirm the done page, then delete that attendee via `execute_sql`. Commit `feat(portal): restyled registration and error pages`.

---

### Task 7: Admin shell, dashboard, forms

**Files:**
- Create: `src/components/admin/Sidebar.tsx`
- Rewrite: `src/app/admin/layout.tsx`, `src/app/admin/events/[id]/layout.tsx`, `src/app/admin/page.tsx`, `src/app/admin/events/[id]/page.tsx`, `src/app/login/page.tsx`
- Modify: `src/components/admin/Field.tsx`, `SubmitButton.tsx`, `ConfirmButton.tsx` (token classes only)

**Interfaces:**
- `Sidebar` props: `{ email: string; event?: { id: string; name: string; status: string } | null; current: string }`. Groups when an event is selected: Setup (Overview `""`, Settings `settings`, Modules `modules`), Content (Agenda, Announcements, Info), Attendees (Attendees, Import `attendees/import`), Onsite (Checkpoints, Scanner `/scan/<id>`), Reports (the three export links). Without an event: Events list only. Sign-out form at the bottom. On screens under `md` the sidebar collapses to a top bar with a horizontal scroll of the current group's links.

- [ ] **Step 1: Sidebar**

```tsx
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { signOut } from "@/app/login/actions";

type Item = { href: string; label: string; icon: IconName };
type Group = { title: string; items: Item[] };

export function groupsFor(ev: { id: string } | null | undefined): Group[] {
  if (!ev) return [{ title: "Events", items: [{ href: "/admin", label: "All events", icon: "layers" }] }];
  const b = `/admin/events/${ev.id}`;
  return [
    { title: "Setup", items: [{ href: b, label: "Overview", icon: "home" }, { href: `${b}/settings`, label: "Settings", icon: "settings" }, { href: `${b}/modules`, label: "Modules", icon: "grid" }] },
    { title: "Content", items: [{ href: `${b}/agenda`, label: "Agenda", icon: "calendar" }, { href: `${b}/announcements`, label: "Announcements", icon: "megaphone" }, { href: `${b}/info`, label: "Info page", icon: "info" }] },
    { title: "Attendees", items: [{ href: `${b}/attendees`, label: "Attendees", icon: "users" }, { href: `${b}/attendees/import`, label: "Import", icon: "download" }] },
    { title: "Onsite", items: [{ href: `${b}/checkpoints`, label: "Checkpoints", icon: "flag" }, { href: `/scan/${ev.id}`, label: "Scanner", icon: "scan" }] },
    { title: "Reports", items: [{ href: `${b}/export/attendance.xlsx`, label: "Attendance", icon: "file" }, { href: `${b}/export/links.xlsx`, label: "Links", icon: "link" }, { href: `${b}/export/qr.zip`, label: "QR codes", icon: "qr" }] },
  ];
}

export function Sidebar({ email, event, current }: { email: string; event?: { id: string; name: string; status: string } | null; current: string }) {
  const groups = groupsFor(event);
  return (
    <aside className="flex w-full flex-col gap-4 border-b border-line bg-surface p-4 md:min-h-screen md:w-64 md:border-b-0 md:border-r">
      <Link href="/admin" className="flex items-center gap-2 font-extrabold"><span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-brand text-xs text-white">OL</span> Orange Lobby</Link>
      {event && <div className="rounded-[10px] bg-canvas p-3"><div className="truncate text-sm font-bold">{event.name}</div><div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{event.status}</div></div>}
      <nav className="flex gap-4 overflow-x-auto md:flex-col">
        {groups.map((g) => (
          <div key={g.title} className="flex shrink-0 flex-col gap-0.5">
            <div className="px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{g.title}</div>
            {g.items.map((i) => (
              <Link key={i.href} href={i.href} className={`flex min-h-10 items-center gap-2 rounded-[8px] px-2 text-sm ${current === i.href ? "bg-brand-soft font-bold text-brand-ink" : "font-semibold text-ink hover:bg-canvas"}`}><Icon name={i.icon} size={18} />{i.label}</Link>
            ))}
          </div>
        ))}
      </nav>
      <form action={signOut} className="mt-auto flex items-center justify-between text-xs text-muted"><span className="truncate">{email}</span><button className="flex items-center gap-1 font-bold"><Icon name="logout" size={14} /> Sign out</button></form>
    </aside>
  );
}
```

`src/app/admin/layout.tsx` renders `<div className="flex min-h-screen flex-col md:flex-row">` with `<Sidebar email current>` (no event) and `<main className="flex-1 p-6">`. The event layout (`admin/events/[id]/layout.tsx`) needs the event for the sidebar; since layouts nest, restructure: the root admin layout only wraps in the flex container and passes children; the event layout renders `Sidebar` with the event; the events-list page renders `Sidebar` without. To determine `current`, read `headers().get("x-pathname")`? Next does not provide it; instead pass `current` from each page via a tiny client component `usePathname()` inside `Sidebar` (make `Sidebar` a client component that receives `groups` as props and computes `current` with `usePathname()`; `signOut` form action still works in a client component when imported from a `"use server"` file). Do that.

- [ ] **Step 2: Dashboard and list**

`admin/page.tsx`: grid of event cards (name, dates, status `Pill`, attendee count) plus "New event" `ButtonLink`. `admin/events/[id]/page.tsx`: `Stat` cards for attendees, per-checkpoint check-ins, registration state; Links card with copy fields; Status segmented buttons restyled; Exports as `ButtonLink` secondary with icons; purge card unchanged in behaviour. `login/page.tsx`: centred `Card` with the mark and the form.

- [ ] **Step 3: Verify, browser check, commit**

Sign in, walk every admin page, confirm no layout breaks at 390px width. Commit `feat(admin): sidebar shell and dashboard`.

---

### Task 8: Scanner restyle

**Files:**
- Modify: `src/app/scan/[eventId]/page.tsx`, `src/app/scan/[eventId]/Scanner.tsx`

- [ ] **Step 1: Restyle**

Checkpoint picker: `Card` rows with name, `count/total` `Pill`, chevron. Scanner: header row (back link, checkpoint name, count `Pill`); `#reader` in a `rounded-[var(--radius-card)] overflow-hidden`; result card full-width with `bg-green-600` / `bg-amber-500` / `bg-red-600` / idle `bg-surface border-line`, name `text-2xl font-extrabold`, fields as a 2-column `dl`; search input `min-h-12`; hits as `Card` rows; walk-in form inside a `Card`. No logic changes; keep `busyRef`, debounce, actions.

- [ ] **Step 2: Verify and commit**

Build, lint, phone check over the dev server if a phone is on the same network (camera needs HTTPS: use `npx vercel dev`-style HTTPS or the Vercel preview after merge). Commit `feat(scan): restyled scanner`.

---

### Task 9: Live smoke test, docs, wrap-up

- [ ] **Step 1: Set modules on the test event** through the admin UI (agenda, seat, floor plan off unless a URL exists, info, announcements, one Q&A link tile) and post one pinned announcement.
- [ ] **Step 2: Walk the personal and generic portals** on desktop and on a phone; fix anything broken in a fix commit.
- [ ] **Step 3: Docs.** Add a "Modules" step to `docs/runbook.md` under New event, and add a "Verified" line for the redesign to `docs/dry-run-verification.md`. Commit `docs: modules in runbook`.

---

## Self-review

**Spec coverage:** D26 (Task 4), D27 (Tasks 2, 3), D28 (Task 1, applied in 4–8), D29 (Task 4), D30 (Task 5), D31 (Task 7), D32 (Task 8), D33 deferred by design. Existing URLs preserved; new routes listed in Global Constraints.

**Placeholder scan:** Task 5 describes the announcements, info and seat restyles in prose with exact classes and components named rather than full files; Task 6, 7 Step 2 and 8 likewise. These are restyles of files the implementer reads in full, with the token vocabulary fixed in Task 1, so the prose is a specification of classes rather than a "TBD". Every new module has full code.

**Type consistency:** `Tile.icon` is `ModuleIcon ⊂ IconName`, so `TileGrid` can pass it to `Icon`. `resolveTiles` takes `Pick<Event, ...>` including `modules`, which Task 2 adds to `Event`. `nowInKL` returns `{date, time}` consumed by `nextSession`, `isNow`, `pickDay` with the same string formats. `PortalShell`'s `current` union matches the nav hrefs. `updateEvent(id, { modules })` type-checks once `Event.modules` exists.
