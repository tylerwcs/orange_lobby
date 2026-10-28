import { PendingLink } from "@/components/PendingNav";
import { SearchInput } from "@/components/admin/SearchInput";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { shortDateTime } from "@/lib/text";
import { countChanges, listChanges, listChangeActors } from "../db";
import { KIND_GROUPS, KIND_GROUP_LABELS } from "../lib/kinds";
import { whatChanged } from "../lib/what-changed";
import { ChangeDetail } from "./ChangeDetail";
import { Delta } from "./Delta";

const PAGE_SIZE = 50;
const SELECT = "h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * D746: the Attendees page's change log, newest first. Search, "who" and "what kind" are plain
 * query parameters, so the two selects are a GET form and the whole view works before the page
 * has hydrated. Admins and committee alike.
 */
export async function ChangeLogView({ eventId, sp }: { eventId: string; sp: Record<string, string | undefined> }) {
  const q = sp.q?.trim() ?? "";
  const by = sp.by?.trim() ?? "";
  const kind = sp.kind && sp.kind in KIND_GROUPS ? (sp.kind as keyof typeof KIND_GROUPS) : undefined;
  const filters = { q: q || undefined, by: by || undefined, group: kind };
  const wanted = Math.max(1, Math.trunc(Number(sp.page)) || 1);

  const [actors, first] = await Promise.all([listChangeActors(eventId), listChanges(eventId, filters, wanted, PAGE_SIZE)]);
  const pages = Math.max(1, Math.ceil(first.total / PAGE_SIZE));
  const page = Math.min(wanted, pages);
  // A page number past the end (a stale link) lands on the last page rather than an empty one.
  const { rows, total } = page === wanted ? first : await listChanges(eventId, filters, page, PAGE_SIZE);
  const filtered = Boolean(q || by || kind);
  const everything = filtered ? await countChanges(eventId) : total;

  const base = `/admin/events/${eventId}/attendees`;
  const pageHref = (p: number) => {
    const qs = new URLSearchParams({ show: "log" });
    if (q) qs.set("q", q);
    if (by) qs.set("by", by);
    if (kind) qs.set("kind", kind);
    if (p > 1) qs.set("page", String(p));
    return `${base}?${qs.toString()}`;
  };
  const from = rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = (page - 1) * PAGE_SIZE + rows.length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <SearchInput initial={sp.q ?? ""} matches={total} total={everything} noun="changes" placeholder="Search name or who" label="Search the change log" />
        </div>
        <form method="get" action={base} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="show" value="log" />
          {q && <input type="hidden" name="q" value={q} />}
          <label className="sr-only" htmlFor="log-by">Done by</label>
          <select id="log-by" name="by" defaultValue={by} className={SELECT}>
            <option value="">Anyone</option>
            {actors.map((a) => <option key={a.email} value={a.email}>{a.name}{a.kind === "committee" ? " (Committee)" : ""}</option>)}
          </select>
          <label className="sr-only" htmlFor="log-kind">Kind of change</label>
          <select id="log-kind" name="kind" defaultValue={kind ?? ""} className={SELECT}>
            <option value="">All changes</option>
            {(Object.keys(KIND_GROUPS) as (keyof typeof KIND_GROUPS)[]).map((g) => <option key={g} value={g}>{KIND_GROUP_LABELS[g]}</option>)}
          </select>
          <SubmitButton variant="outline">Filter</SubmitButton>
        </form>
      </div>

      {rows.length === 0
        ? <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">{filtered ? "No changes match." : "No changes recorded yet."}</p>
        : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Did</TableHead>
                  <TableHead>What changed</TableHead>
                  <TableHead><span className="sr-only">Detail</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{shortDateTime(c.at)}</TableCell>
                    <TableCell>
                      <span className="font-semibold">{c.actorName}</span>{" "}
                      <Badge variant="outline">{c.actorKind === "admin" ? "Admin" : "Committee"}</Badge>
                    </TableCell>
                    <TableCell className={`min-w-56 max-w-md whitespace-normal ${c.kind === "delete" || c.kind === "bulk_delete" ? "text-destructive" : ""}`}>{c.summary}</TableCell>
                    <TableCell className="min-w-40 max-w-xs whitespace-normal break-words">
                      {(() => {
                        const w = whatChanged(c);
                        return w ? <><span className="font-semibold">{w.label}{w.before !== undefined ? ":" : ""}</span> <Delta before={w.before} after={w.after} /></> : null;
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {c.people.length > 0 && <ChangeDetail change={c} />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span className="tabular-nums">Showing {from}–{to} of {total}</span>
        <div className="flex flex-wrap items-center gap-2">
          {page > 1
            ? <PendingLink href={pageHref(page - 1)} className={buttonVariants({ variant: "outline" })}>Previous</PendingLink>
            : <span className={`${buttonVariants({ variant: "outline" })} opacity-50`} aria-disabled="true">Previous</span>}
          <span className="tabular-nums">Page {page} of {pages}</span>
          {page < pages
            ? <PendingLink href={pageHref(page + 1)} className={buttonVariants({ variant: "outline" })}>Next</PendingLink>
            : <span className={`${buttonVariants({ variant: "outline" })} opacity-50`} aria-disabled="true">Next</span>}
        </div>
      </div>
    </>
  );
}
