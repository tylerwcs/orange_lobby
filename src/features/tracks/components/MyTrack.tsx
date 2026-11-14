import Link from "next/link";
import { ConfirmSubmit } from "./ConfirmSubmit";

type Side = { side: "a" | "b"; label: string; name: string };

/**
 * D904 (replaces D725's note): where this attendee stands on a track pair, above My team, and
 * the way to pick or change their own track. With no track, both tracks are offered; on either
 * track, one quiet "Switch" moves them. A move removes what they logged today on the track they
 * leave (D726), so the switch asks first when there is something to lose.
 */
export function MyTrack({ status, here, other, otherHref, pick, loggedToday, fullTarget = null }: {
  status: "this" | "other" | "none";
  /** This page's track and the other one. */
  here: Side; other: Side; otherHref: string;
  pick: (side: "a" | "b") => () => Promise<void>;
  /** Whether they logged today on the track they're on now. */
  loggedToday: boolean;
  /** D730: the team's places on this track are taken today (only with daily places set). */
  fullTarget?: number | null;
}) {
  const text = "text-sm text-muted-foreground";
  const mine = status === "this" ? here : status === "other" ? other : null;
  const moveTo = status === "this" ? other : here;
  const ask = mine && loggedToday ? `Switching to ${moveTo.label} removes what you logged on ${mine.label} today.` : null;

  if (status === "none") {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="font-extrabold">Pick your track</p>
          <p className={text}>Choose the one you&apos;ll log on. You can switch later.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[here, other].sort((x, y) => x.side.localeCompare(y.side)).map((t) => (
            <form key={t.side} action={pick(t.side)} className="contents">
              <ConfirmSubmit variant={t.side === here.side ? "default" : "outline"} className="w-full">
                {t.label} · {t.name}
              </ConfirmSubmit>
            </form>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {status === "this" && fullTarget !== null
        ? <p className={text}>You&apos;re on {here.label}, but your team&apos;s {fullTarget} places on it are taken today. Try again tomorrow.</p>
        : status === "this"
          ? <p className={text}>You&apos;re on {here.label} — this is your track.</p>
          : <p className={text}>You&apos;re on {other.label} — <Link href={otherHref} className="font-bold text-foreground underline underline-offset-2">submit under {other.name}</Link>.</p>}
      <form action={pick(moveTo.side)}>
        <ConfirmSubmit variant="link" confirm={ask}>
          {status === "other" ? `Switch to ${here.label} instead` : `Switch to ${other.label}`}
        </ConfirmSubmit>
      </form>
    </div>
  );
}
