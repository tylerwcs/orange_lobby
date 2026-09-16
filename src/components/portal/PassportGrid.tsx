import type { Passport, PassportCell } from "@/lib/booths";
import { progressLine } from "@/lib/booths";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { meterPercent, meterAriaValue, meterAriaMax } from "@/lib/meter";
import { shortTime, shortDateTime } from "@/lib/text";

// A small tilt per cell echoes an actual rubber stamp landing slightly askew - purely
// decorative, cycled by index so it never depends on how many booths an event has.
const TILTS = [-7, 5, -3, 7];

/**
 * A collected chop: two rings in the event's brand colour with a checkmark in `primary`,
 * matching the mockups. The two tones can't share one `currentColor`, so the rings and the
 * check sit in their own `<g>`/path each carrying its own text colour.
 */
function StampGlyph({ deg, size = 52 }: { deg: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-hidden="true" className="shrink-0" style={{ transform: `rotate(${deg}deg)` }}>
      <g className="text-brand">
        <circle cx="28" cy="28" r="25" stroke="currentColor" strokeWidth="3" />
        <circle cx="28" cy="28" r="19" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
      </g>
      <path d="M19 28.5l6.5 6.5L37 23" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary" />
    </svg>
  );
}

/**
 * The "not yet" ring. Drawn in `text-muted-foreground`, not a pale hairline: this ring IS
 * the empty state, and it has to read from arm's length in a lit foyer, not just on a
 * calibrated screen.
 */
function EmptyRing({ size = 52 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-hidden="true" className="shrink-0 text-muted-foreground">
      <circle cx="28" cy="28" r="25" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 5.5" opacity=".75" />
    </svg>
  );
}

/**
 * One booth. Unstamped cells still carry the booth's name and location (D102) - the card
 * is a wayfinding tool, and a cell that says nothing once it is empty is just a grey box.
 * `wide` spans both columns: an odd booth count would otherwise leave a hole that reads as
 * a rendering bug rather than as "nothing here yet".
 */
function Cell({ cell, deg, wide }: { cell: PassportCell; deg: number; wide: boolean }) {
  const stamped = cell.stampedAt !== null;
  const glyph = stamped ? <StampGlyph deg={deg} /> : <EmptyRing />;
  const tone = stamped ? "bg-card ring-1 ring-foreground/10" : "border border-dashed border-border";
  const info = (
    <div className="min-w-0">
      <div className="text-sm font-extrabold leading-tight text-balance">{cell.booth.name}</div>
      {cell.booth.location && <div className="truncate text-xs text-muted-foreground">{cell.booth.location}</div>}
    </div>
  );

  if (wide) {
    return (
      <div className={`col-span-2 flex min-h-[100px] items-center gap-3.5 rounded-2xl p-3.5 ${tone}`}>
        {glyph}
        <div className="min-w-0 flex-1">{info}</div>
        {stamped && <div className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{shortTime(cell.stampedAt!)}</div>}
      </div>
    );
  }
  return (
    <div className={`flex min-h-[146px] flex-col gap-2.5 rounded-2xl p-3.5 ${tone}`}>
      <div className="flex flex-1 items-start justify-between gap-2">
        {glyph}
        {stamped && <div className="text-xs font-bold tabular-nums text-muted-foreground">{shortTime(cell.stampedAt!)}</div>}
      </div>
      {info}
    </div>
  );
}

function BoothGrid({ cells }: { cells: PassportCell[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {cells.map((cell, i) => (
        <Cell key={cell.booth.id} cell={cell} deg={TILTS[i % TILTS.length]} wide={i === cells.length - 1 && cells.length % 2 === 1} />
      ))}
    </div>
  );
}

/** The counter while still collecting: same dark treatment as BadgeCard, brand-coloured big number. */
function ProgressHeader({ passport }: { passport: Passport }) {
  if (passport.target === 0) {
    return <div className="rounded-2xl bg-foreground p-4 text-sm font-bold text-background/70">No booths yet</div>;
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-foreground p-4 text-background">
      <div className="flex items-end gap-2.5">
        <div className="text-[46px] leading-[0.88] font-extrabold tabular-nums text-brand">{passport.collected}</div>
        <div className="pb-0.5 text-base font-bold">of {passport.target} stamps</div>
        <div className="flex-1" />
        <div className="pb-1 text-xs font-bold text-background/70">{passport.remaining} more to go</div>
      </div>
      <Progress
        value={meterPercent(passport.collected, passport.target)}
        aria-label={progressLine(passport)}
        aria-valuenow={meterAriaValue(passport.collected, passport.target)}
        aria-valuemin={0}
        aria-valuemax={meterAriaMax(passport.target)}
        className="[&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:bg-white/15 [&_[data-slot=progress-indicator]]:bg-brand"
      />
    </div>
  );
}

/**
 * The card the counter checks against the badge in the attendee's hand: the NAME is the
 * largest thing on it, which is also what makes a forwarded screenshot useless - there is
 * no name to match on someone else's phone. Then the event's own `stamps_message`, then
 * when the card filled.
 */
function CompleteHeader({ passport, attendeeName, message }: { passport: Passport; attendeeName: string; message: string | null }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-foreground text-background">
      <div className="flex items-center gap-3.5 p-4">
        <StampGlyph deg={-8} size={62} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="inline-flex w-fit items-center rounded-full bg-success/25 px-2.5 py-1 text-xs font-extrabold text-success-soft">{progressLine(passport)}</span>
          <div className="truncate text-2xl font-extrabold leading-tight">{attendeeName}</div>
          {passport.completedAt && <div className="text-xs font-semibold tabular-nums text-background/70">Completed {shortDateTime(passport.completedAt)}</div>}
        </div>
      </div>
      {message && <div className="text-pretty bg-accent px-4 py-3.5 text-sm font-bold leading-relaxed text-primary">{message}</div>}
    </div>
  );
}

/** No attendee behind this link: the signage QR in the foyer opens this with nothing to
 *  check progress against, so it renders locked (D103) rather than guessing at someone's
 *  progress. The booth list stays underneath - wayfinding still works without a badge. */
function LockedPassport({ passport }: { passport: Passport }) {
  return (
    <div className="flex flex-col gap-4">
      <Empty className="border border-dashed border-border">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-accent text-primary">
            <Icon name="grid" size={26} />
          </EmptyMedia>
          <EmptyTitle>Your passport is on your badge</EmptyTitle>
          <EmptyDescription>Scan the QR code on your badge to open your own passport. Stamps are saved to you, not to this phone.</EmptyDescription>
        </EmptyHeader>
      </Empty>
      {passport.cells.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            {passport.cells.length} booth{passport.cells.length === 1 ? "" : "s"} at this event
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
            {passport.cells.map((c) => (
              <li key={c.booth.id} className="flex min-h-11 items-center gap-3 p-3.5">
                <EmptyRing />
                <div className="min-w-0">
                  <div className="text-sm font-extrabold leading-tight">{c.booth.name}</div>
                  {c.booth.location && <div className="truncate text-xs text-muted-foreground">{c.booth.location}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The attendee's Booth Passport: a counter, a grid of booths, and whichever of the three
 * states applies. `attendeeName` doubles as the switch for the generic, no-attendee link -
 * that page has nobody's progress to show, so it renders locked (D103) rather than guessing.
 */
export function PassportGrid({ passport, message, attendeeName }: { passport: Passport; message: string | null; attendeeName: string | null }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-xl font-extrabold leading-tight">Booth Passport</h1>
        {attendeeName !== null && <p className="text-sm text-muted-foreground">Visit a booth, hand over your badge, collect a chop.</p>}
      </div>

      {attendeeName === null ? (
        <LockedPassport passport={passport} />
      ) : (
        <>
          {passport.complete
            ? <CompleteHeader passport={passport} attendeeName={attendeeName} message={message} />
            : <ProgressHeader passport={passport} />}
          <BoothGrid cells={passport.cells} />
          {/* D20: the portal refetches on open, it never pushes - without this line a stamp
              given while the page is open reads as a stamp that did not happen. */}
          {!passport.complete && (
            <p className="text-pretty text-xs leading-relaxed text-muted-foreground">A new chop appears the next time you open this page.</p>
          )}
        </>
      )}
    </div>
  );
}
