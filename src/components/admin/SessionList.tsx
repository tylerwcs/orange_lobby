"use client";
import { useOptimistic, useRef, useState, useTransition } from "react";
import type { SessionSeats } from "@/lib/activities";
import { meterPercent } from "@/lib/meter";
import { moveItem } from "@/lib/reorder";
import { Icon } from "@/components/ui/icon";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type Reorder = (ids: string[]) => Promise<void>;
type AddSession = (fd: FormData) => Promise<void>;
type SaveSession = (sessionId: string, fd: FormData) => Promise<void>;
type DeleteSession = (sessionId: string) => Promise<void>;

/**
 * The sessions of one activity, in the order they are offered to attendees.
 *
 * Copied from `BoothList` rather than written fresh, so the two lists behave identically: the
 * same `useOptimistic` order, the same drag handle that is also the keyboard route (focus it,
 * arrow keys move the row — a drag with no keyboard equivalent fails WCAG 2.5.7), and both
 * routes going through `moveItem` so they cannot drift apart.
 *
 * What differs from a booth row: each item carries seat numbers rather than a stamp count
 * (`SessionSeats`, computed a render ago and never the authority — `book_session` decides what
 * a booking may do), the row shows the session's day/time/location under its title, and a
 * session WITH bookings is still deletable — deleting it cascades those bookings (D135), so its
 * confirm dialog is the one place that has to say so before the click lands.
 */
export function SessionList({ items, addSession, saveSession, deleteSession, reorder }: {
  items: SessionSeats[];
  addSession: AddSession;
  saveSession: SaveSession;
  deleteSession: DeleteSession;
  reorder: Reorder;
}) {
  const [order, setOrder] = useOptimistic(items);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const fromRef = useRef<number | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const moved = order[from];
    const next = moveItem(order, from, to);
    startTransition(async () => {
      setOrder(next);
      setMessage(`${moved.session.title} moved to position ${next.indexOf(moved) + 1} of ${next.length}`);
      await reorder(next.map((item) => item.session.id));
    });
  };

  return (
    <div>
      <div className="flex justify-end py-3">
        <Modal title="Add a session" trigger="Add session" icon="plus">
          <form action={addSession} className="grid gap-4">
            <Field label="Title" name="title" placeholder="Morning track" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Day" name="day" type="date" />
              <Field label="Capacity" name="capacity" type="number" defaultValue="20" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Starts" name="starts_at" type="time" />
              <Field label="Ends (optional)" name="ends_at" type="time" />
            </div>
            <Field label="Location (optional)" name="location" placeholder="Room 2A" />
            <SubmitButton>Add session</SubmitButton>
          </form>
        </Modal>
      </div>

      {order.length === 0 ? (
        <p className="pb-4 text-sm text-muted-foreground">No sessions yet. Add one to let attendees book a seat.</p>
      ) : (
        <ul className="divide-y divide-border" aria-busy={pending}>
          {order.map((item, i) => {
            const { session } = item;
            const when = [session.day, session.ends_at ? `${session.starts_at}–${session.ends_at}` : session.starts_at]
              .filter(Boolean).join(" · ");
            return (
              <li
                key={session.id}
                draggable
                onDragStart={(e) => { fromRef.current = i; setDragging(i); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(i); }}
                onDragLeave={() => setOver((prev) => (prev === i ? null : prev))}
                onDrop={(e) => { e.preventDefault(); const from = fromRef.current; setDragging(null); setOver(null); if (from !== null) move(from, i); }}
                onDragEnd={() => { fromRef.current = null; setDragging(null); setOver(null); }}
                className={`flex flex-wrap items-center gap-3 py-3 transition-colors duration-150 ${dragging === i ? "opacity-50" : ""} ${over === i && dragging !== i ? "bg-accent" : ""}`}
              >
                {/* The handle is the keyboard route as well as the pointer one: focus it and
                    the arrow keys move the row. A drag with no keyboard equivalent fails
                    WCAG 2.5.7, and a pair of arrow buttons on every row was the clutter this
                    replaces. */}
                <button
                  type="button"
                  aria-label={`Reorder ${session.title}. Position ${i + 1} of ${order.length}. Use the arrow keys to move it.`}
                  onKeyDown={(e) => {
                    const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null;
                    if (to === null) return;
                    e.preventDefault();
                    move(i, to);
                  }}
                  className="flex h-11 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-background active:cursor-grabbing"
                >
                  <Icon name="grip" size={18} />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{session.title}</div>
                  <div className="text-xs font-semibold text-muted-foreground">
                    {when}
                    {session.location ? ` · ${session.location}` : ""}
                  </div>
                </div>

                <div className="flex w-40 shrink-0 flex-col gap-1">
                  <Badge variant={item.full ? "outline" : "secondary"} className="w-fit tabular-nums">
                    {item.booked} / {session.capacity}
                  </Badge>
                  <Progress value={meterPercent(item.booked, session.capacity)} aria-label={`${item.booked} of ${session.capacity} seats booked`} />
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Modal title={`Edit ${session.title}`} trigger="Edit" variant="outline">
                    <form action={saveSession.bind(null, session.id)} className="grid gap-4">
                      <Field label="Title" name="title" defaultValue={session.title} />
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Day" name="day" type="date" defaultValue={session.day} />
                        <Field label="Capacity" name="capacity" type="number" defaultValue={String(session.capacity)} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Starts" name="starts_at" type="time" defaultValue={session.starts_at} />
                        <Field label="Ends (optional)" name="ends_at" type="time" defaultValue={session.ends_at} />
                      </div>
                      <Field label="Location (optional)" name="location" defaultValue={session.location} />
                      <SubmitButton>Save</SubmitButton>
                    </form>
                  </Modal>

                  <form action={() => deleteSession(session.id)}>
                    <ConfirmButton
                      message={`Delete ${session.title}? Its ${item.booked} booking${item.booked === 1 ? "" : "s"} go with it.`}
                      className="text-destructive"
                    >
                      Delete
                    </ConfirmButton>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="sr-only" role="status" aria-live="polite">{message}</p>
      {order.length > 1 && (
        <p className="p-4 pt-3 text-xs text-muted-foreground">Drag a row by its handle — or focus the handle and use the arrow keys — to set the order sessions are offered in. Saved as you go.</p>
      )}
    </div>
  );
}
