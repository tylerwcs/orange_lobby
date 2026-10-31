import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { nowInKL } from "@/lib/time";
import { ADDON_KEYS, CORE_KEYS, FEATURES, type Origin } from "../catalogue";
import { has } from "../features";
import { allEventsUsage } from "../db";
import { latestOf, reviewEntries, reviewFlags, type UsageRow } from "../review";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "MYBESTME · Oct 2026 · D736": the client event, the month it shipped, and its decision. */
function originLabel(o: Origin): string {
  const [y, m] = o.date.split("-");
  return [o.event, `${MONTHS[Number(m) - 1] ?? m} ${y}`, o.decision].filter(Boolean).join(" · ");
}

const plural = (n: number) => `${n} ${n === 1 ? "event" : "events"}`;
const TIER_LABEL = { core: "Core", optional: "Add-on", experimental: "Experimental" } as const;

function EventLink({ r }: { r: UsageRow }) {
  return (
    <Link href={`/admin/events/${r.eventId}`} className="inline-flex items-center gap-1.5 hover:underline">
      <span>{r.eventName}</span>
      <Badge variant={r.status === "live" ? "success" : r.status === "archived" ? "outline" : "secondary"}>{r.status}</Badge>
    </Link>
  );
}

/** The registry across every event of the org (D780), and the list of what to look at this quarter (D782). */
export async function FeaturesPage({ orgId }: { orgId: string }) {
  const rows = await allEventsUsage(orgId);
  const today = nowInKL().date;
  const flags = reviewFlags(reviewEntries(rows), today);

  return (
    <>
      <AdminHeader title="Features" subtitle="What the platform can do, and which events use it." />
      <Tabs defaultValue="all" className="gap-4">
        <TabsList>
          <TabsTrigger value="all">All features</TabsTrigger>
          <TabsTrigger value="review">Review{flags.length > 0 ? ` (${flags.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="flex flex-col gap-4 @container">
          {[...CORE_KEYS, ...ADDON_KEYS].map((key) => {
            const f = FEATURES[key];
            const users = rows.filter((r) => has(r.features, key));
            const latest = latestOf(users);
            return (
              <Card key={key} className="overflow-hidden pb-0">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {f.name}
                    <Badge variant={f.tier === "experimental" ? "outline" : "secondary"}>{TIER_LABEL[f.tier]}</Badge>
                  </CardTitle>
                  <CardDescription>{f.summary}</CardDescription>
                  <p className="text-xs text-muted-foreground">
                    {f.origin && <>{originLabel(f.origin)} · </>}
                    {f.tier === "core" ? "Every event" : users.length === 0 ? "On for no events" : `On for ${plural(users.length)}${latest ? ` · latest: ${latest.eventName} (${latest.status})` : ""}`}
                  </p>
                </CardHeader>
                <CardContent className="px-0">
                  {f.options.length > 0 && (
                    <ul className="divide-y divide-border border-t border-border">
                      {f.options.map((o) => {
                        const n = rows.filter((r) => r.options.has(o.key)).length;
                        return (
                          <li key={o.key} className="flex flex-col gap-1 px-4 py-3">
                            <span className="flex flex-wrap items-center gap-2 text-sm font-bold">
                              {o.name}
                              {o.experimental && <Badge variant="outline">Experimental</Badge>}
                              {o.inUse && <Badge variant={n > 0 ? "success" : "secondary"}>Used by {plural(n)}</Badge>}
                            </span>
                            <span className="text-xs text-muted-foreground">{o.summary}</span>
                            <span className="text-xs text-muted-foreground">
                              {o.where}{o.origin && <> · {originLabel(o.origin)}</>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="review" className="flex flex-col gap-4 @container">
          <p className="text-sm text-muted-foreground">
            Add-ons and options to look at once a quarter. One client only: experimental, and used by one event or none. Gone quiet: shipped over three months ago, and no event in the last three months uses it.
          </p>
          {flags.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Nothing to review.</EmptyTitle>
                <EmptyDescription>Every add-on and option with an origin is either proven on more than one event or still new.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Card className="overflow-hidden pb-0">
              <CardContent className="px-0">
                <ul className="divide-y divide-border">
                  {flags.map(({ entry, oneClient, goneQuiet }) => (
                    <li key={entry.key} className="flex flex-col gap-1.5 px-4 py-3">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-bold">
                        {entry.name}
                        {entry.parent && <span className="text-xs font-normal text-muted-foreground">in {FEATURES[entry.parent].name}</span>}
                        {oneClient && <Badge variant="warning">One client only</Badge>}
                        {goneQuiet && <Badge variant="warning">Gone quiet</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground">{originLabel(entry.origin)}</span>
                      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        {entry.users.length === 0 ? <span className="text-muted-foreground">No events use it.</span> : entry.users.map((r) => <EventLink key={r.eventId} r={r} />)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
