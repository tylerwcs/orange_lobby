import type { Passport, PassportCell } from "../../lib/booths";
import { progressLine } from "../../lib/booths";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { meterPercent, meterAriaValue, meterAriaMax } from "@/lib/meter";
import { shortDateTime } from "@/lib/text";
import { TITLE_INK } from "@/lib/ink";
import { MapLink } from "../../portal/MapLink";
import { StampInk } from "./StampDisc";
import { LandedSlot } from "./PassportLive";
import { PassportPaper } from "./PassportPaper";
import { PAPER_INK } from "./paper";

// A small tilt per cell echoes an actual rubber stamp landing slightly askew - purely
// decorative, cycled by index so it never depends on how many booths an event has.
const TILTS = [-7, 5, -3, 7];

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
 * The map button on the paper (Review Focus 5): the outline button's own fill is the page's
 * colour - navy on a dark theme - which would sit on the cream as a dark chip. `!` so these win
 * over buttonVariants' `bg-background`, whatever order the CSS lands in.
 */
const MAP_ON_PAPER = "border-[rgba(138,106,64,0.3)]! bg-transparent! text-[#5E4526]! hover:bg-[rgba(138,106,64,0.1)]!";

/**
 * One slot on the passport page (D850, D856). Until stamped: a dashed circle with a "?", the
 * booth's name and location - the page is still the wayfinding (D102). Once stamped: the stamp
 * pressed straight onto the paper; its name is not repeated, designers draw it into the art.
 * `data-booth-slot` / `data-slot-face` / `data-deg` are what the reveal measures to land in.
 */
function RoundSlot({ cell, deg, alone }: { cell: PassportCell; deg: number; alone: boolean }) {
  const stamped = cell.stampedAt !== null;
  return (
    <div
      data-booth-slot={cell.booth.id}
      // An odd last slot sits centred in its row at a normal slot's width, not stretched across it.
      className={`flex min-w-0 flex-col items-center gap-1.5 ${alone ? "col-span-2 w-[calc(50%-0.4375rem)] justify-self-center" : ""}`}
    >
      <div data-slot-face data-deg={deg} className="relative aspect-square w-full p-[6%]">
        {stamped ? (
          <StampInk image={cell.booth.stamp_image_url} name={cell.booth.name} deg={deg} />
        ) : (
          <LandedSlot
            boothId={cell.booth.id} image={cell.booth.stamp_image_url} name={cell.booth.name} deg={deg}
            // max-w-full: in a centred column a text line is only as wide as its longest word, so
            // break-words alone never breaks it - a long booth name spilled past the ring.
            empty={
              <div className="flex size-full flex-col items-center justify-center rounded-full border-[1.5px] border-dashed p-3 text-center" style={{ borderColor: PAPER_INK.dash }}>
                <div aria-hidden="true" className="text-3xl leading-none" style={{ color: PAPER_INK.question }}>?</div>
                <div className="mt-1.5 max-w-full text-[11px] leading-tight font-bold tracking-[0.12em] text-balance break-words uppercase" style={{ color: PAPER_INK.booth }}>{cell.booth.name}</div>
                {cell.booth.location && <div className="mt-0.5 line-clamp-2 max-w-full text-xs break-words" style={{ color: PAPER_INK.location }}>{cell.booth.location}</div>}
              </div>
            }
          />
        )}
      </div>
      <MapLink href={cell.booth.location_url} place={cell.booth.location ?? cell.booth.name} className={MAP_ON_PAPER} />
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
 *  progress. The booths stay underneath, on a passport page with no holder (D854) - wayfinding
 *  still works without a badge. */
function LockedPassport({ passport, brand }: { passport: Passport; brand: string | null }) {
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
        <PassportPaper holder={null} brand={brand}>
          <RoundGrid cells={passport.cells} />
        </PassportPaper>
      )}
    </div>
  );
}

/**
 * The attendee's Booth Passport: a counter, a grid of booths, and whichever of the three
 * states applies. `attendeeName` doubles as the switch for the generic, no-attendee link -
 * that page has nobody's progress to show, so it renders locked (D103) rather than guessing.
 */
export function PassportGrid({ passport, message, attendeeName, title, brand }: {
  passport: Passport;
  message: string | null;
  attendeeName: string | null;
  /** The page heading. Null on the activity page, where the activity's own name already heads it. */
  title: string | null;
  /** The event's colour (`primary_color`), which the plain chop is pressed in on the paper (D856). */
  brand: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        {title !== null && <h1 className={`text-xl font-extrabold leading-tight ${TITLE_INK}`}>{title}</h1>}
        {attendeeName !== null && <p className="text-sm text-muted-foreground">Visit a booth and show your QR to collect a stamp.</p>}
      </div>

      {attendeeName === null ? (
        <LockedPassport passport={passport} brand={brand} />
      ) : (
        <>
          {passport.complete
            ? <CompleteHeader passport={passport} message={message} />
            : <ProgressHeader passport={passport} />}
          {/* D851: the old "a new chop appears the next time you open this page" line is gone -
              Show my QR now watches for the stamp, and one collected without it replays on open. */}
          {/* D857: one look for every passport - the stamps on a paper page with the holder's name. */}
          <PassportPaper holder={attendeeName} brand={brand}>
            <RoundGrid cells={passport.cells} />
          </PassportPaper>
        </>
      )}
    </div>
  );
}
