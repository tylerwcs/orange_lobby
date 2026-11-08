import type { Passport, PassportCell } from "../../lib/booths";
import { passportLook, progressLine } from "../../lib/booths";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { meterPercent, meterAriaValue, meterAriaMax } from "@/lib/meter";
import { shortDateTime } from "@/lib/text";
import { TITLE_INK } from "@/lib/ink";
import { MapLink } from "../../portal/MapLink";
import { StampDisc, StampGlyph } from "./StampDisc";

// A small tilt per cell echoes an actual rubber stamp landing slightly askew - purely
// decorative, cycled by index so it never depends on how many booths an event has.
const TILTS = [-7, 5, -3, 7];

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
      <div className="text-sm font-extrabold leading-tight text-balance break-words">{cell.booth.name}</div>
      {cell.booth.location && <div className="truncate text-xs text-muted-foreground">{cell.booth.location}</div>}
    </div>
  );

  if (wide) {
    return (
      <div data-booth-slot={cell.booth.id} className={`col-span-2 flex min-h-[100px] items-center gap-3.5 rounded-2xl p-3.5 ${tone}`}>
        {glyph}
        <div className="min-w-0 flex-1">{info}</div>
        <MapLink href={cell.booth.location_url} place={cell.booth.location ?? cell.booth.name} />
      </div>
    );
  }
  return (
    // min-w-0: this is the grid item that holds the grid-cols-2 track. Without it, a long
    // unbroken booth name sets this flex column's min-content width and blows the track out
    // past the viewport (a client can rename a booth in the week before the event).
    <div data-booth-slot={cell.booth.id} className={`flex min-h-[146px] min-w-0 flex-col gap-2.5 rounded-2xl p-3.5 ${tone}`}>
      <div className="flex flex-1 items-start justify-between gap-2">
        {glyph}
        <MapLink href={cell.booth.location_url} place={cell.booth.location ?? cell.booth.name} />
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
    return <div className="rounded-2xl bg-feature p-4 text-sm font-bold text-feature-foreground/70">No booths yet</div>;
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-feature p-4 text-feature-foreground">
      <div className="flex items-end gap-2.5">
        <div className="text-[46px] leading-[0.88] font-extrabold tabular-nums text-brand">{passport.collected}</div>
        <div className="pb-0.5 text-base font-bold">of {passport.target} stamps</div>
        <div className="flex-1" />
        <div className="pb-1 text-xs font-bold text-feature-foreground/70">{passport.remaining} more to go</div>
      </div>
      <Progress
        value={meterPercent(passport.collected, passport.target)}
        aria-label={progressLine(passport)}
        aria-valuenow={meterAriaValue(passport.collected, passport.target)}
        aria-valuemin={0}
        aria-valuemax={meterAriaMax(passport.target)}
        /* theme-fixed: track wash on --feature */ className="[&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:bg-white/15 [&_[data-slot=progress-indicator]]:bg-brand"
      />
    </div>
  );
}

/**
 * The full card: how many were collected, when the card filled, then the passport's own
 * `reward_message`. It used to lead with the attendee's name, large, so a reward counter could
 * read it against the badge and a forwarded screenshot was useless. The user dropped the name
 * and the chop (D849), so a screenshot of anyone's full card now looks the same as the real one.
 */
function CompleteHeader({ passport, message }: { passport: Passport; message: string | null }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-feature text-feature-foreground">
      <div className="flex flex-col gap-2 p-4">
        <span className="inline-flex w-fit items-center rounded-full bg-brand/25 px-3 py-1.5 text-sm font-extrabold text-feature-accent">{progressLine(passport)}</span>
        {passport.completedAt && <div className="text-sm font-semibold tabular-nums text-feature-foreground/70">Completed {shortDateTime(passport.completedAt)}</div>}
      </div>
      {message && <div className="text-pretty bg-accent px-4 py-3.5 text-sm font-bold leading-relaxed text-primary">{message}</div>}
    </div>
  );
}

/**
 * One round slot (D850), used once any booth on the passport has artwork: a dashed circle with a
 * "?", the name and the location until stamped, then the stamp on its white disc. The name is not
 * repeated under a stamp - designers draw it into the artwork. `data-booth-slot` is what the
 * reveal measures to land in.
 */
function RoundSlot({ cell, deg, alone }: { cell: PassportCell; deg: number; alone: boolean }) {
  const stamped = cell.stampedAt !== null;
  return (
    <div
      data-booth-slot={cell.booth.id}
      // An odd last slot sits centred in its row at a normal slot's width, not stretched across it.
      className={`flex min-w-0 flex-col items-center gap-1.5 ${alone ? "col-span-2 w-[calc(50%-0.4375rem)] justify-self-center" : ""}`}
    >
      <div className="relative aspect-square w-full p-[3%]">
        {stamped ? (
          <StampDisc image={cell.booth.stamp_image_url} name={cell.booth.name} deg={deg} />
        ) : (
          <div className="flex size-full flex-col items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/45 p-3 text-center">
            <div aria-hidden="true" className="text-3xl leading-none font-extrabold text-muted-foreground">?</div>
            <div className="mt-1.5 text-sm leading-tight font-bold text-balance break-words">{cell.booth.name}</div>
            {cell.booth.location && <div className="line-clamp-2 text-xs text-muted-foreground">{cell.booth.location}</div>}
          </div>
        )}
      </div>
      <MapLink href={cell.booth.location_url} place={cell.booth.location ?? cell.booth.name} />
    </div>
  );
}

function RoundGrid({ cells }: { cells: PassportCell[] }) {
  return (
    <div className="grid grid-cols-2 gap-3.5">
      {cells.map((cell, i) => (
        <RoundSlot key={cell.booth.id} cell={cell} deg={TILTS[i % TILTS.length]} alone={i === cells.length - 1 && cells.length % 2 === 1} />
      ))}
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
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold leading-tight">{c.booth.name}</div>
                  {c.booth.location && <div className="truncate text-xs text-muted-foreground">{c.booth.location}</div>}
                </div>
                <MapLink href={c.booth.location_url} place={c.booth.location ?? c.booth.name} />
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
export function PassportGrid({ passport, message, attendeeName, title }: {
  passport: Passport;
  message: string | null;
  attendeeName: string | null;
  /** The page heading. Null on the activity page, where the activity's own name already heads it. */
  title: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        {title !== null && <h1 className={`text-xl font-extrabold leading-tight ${TITLE_INK}`}>{title}</h1>}
        {attendeeName !== null && <p className="text-sm text-muted-foreground">Visit a booth and show your QR to collect a stamp.</p>}
      </div>

      {attendeeName === null ? (
        <LockedPassport passport={passport} />
      ) : (
        <>
          {passport.complete
            ? <CompleteHeader passport={passport} message={message} />
            : <ProgressHeader passport={passport} />}
          {/* D851: the old "a new chop appears the next time you open this page" line is gone -
              Show my QR now watches for the stamp, and one collected without it replays on open. */}
          {passportLook(passport) === "round" ? <RoundGrid cells={passport.cells} /> : <BoothGrid cells={passport.cells} />}
        </>
      )}
    </div>
  );
}
