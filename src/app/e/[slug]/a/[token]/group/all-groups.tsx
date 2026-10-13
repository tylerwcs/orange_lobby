import { ChevronRight } from "lucide-react";
import { listGroups, groupedAttendees } from "@/lib/db/groups";
import { allGroupCards } from "@/lib/groups";
import { eventFields } from "@/lib/attendee-fields";
import { Badge } from "@/components/ui/badge";
import type { Attendee, Event } from "@/lib/types";

const memberCount = (n: number) => `${n} member${n === 1 ? "" : "s"}`;

/**
 * D511–D513: every group as a card - picture, name, member count, a My group badge on theirs - that opens
 * to its members. Native <details>, so it is server-rendered, works without JavaScript and
 * opens from the keyboard. Other groups show names and tags only (D512).
 */
export async function AllGroups({ event, attendee }: { event: Event; attendee: Attendee }) {
  const [groups, members] = await Promise.all([listGroups(event.id), groupedAttendees(event.id)]);
  const fields = eventFields(event.registration_questions, event.attendee_fields);
  const cards = allGroupCards(groups, members, attendee.group_id, event.group_fields, fields);
  if (cards.length === 0) return <p className="text-sm text-muted-foreground">No groups yet.</p>;

  return (
    <ul className="flex flex-col gap-3">
      {cards.map((c) => (
        <li key={c.id}>
          <details className="group overflow-hidden rounded-[14px] border bg-card">
            <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 pr-4 [&::-webkit-details-marker]:hidden">
              {c.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imageUrl} alt="" loading="lazy" decoding="async" className="aspect-[3/2] w-[45%] shrink-0 object-cover" />
              )}
              <span className={`flex min-w-0 flex-1 flex-col gap-0.5 ${c.imageUrl ? "" : "py-3 pl-4"}`}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-extrabold">{c.name}</span>
                  {c.mine && <Badge>My group</Badge>}
                </span>
                <span className="text-sm text-muted-foreground">{memberCount(c.members.length)}</span>
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
            </summary>
            {c.members.length === 0 ? (
              <p className="border-t px-4 py-3 text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <ol className="divide-y border-t px-4">
                {c.members.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-6 shrink-0 tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {m.name}{m.id === attendee.id && <span className="text-muted-foreground"> (you)</span>}
                    </span>
                    {m.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                  </li>
                ))}
              </ol>
            )}
          </details>
        </li>
      ))}
    </ul>
  );
}
