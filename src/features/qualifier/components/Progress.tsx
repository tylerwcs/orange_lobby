"use client";
import type { QualifierView } from "../view";
import { TIER_LABELS, nextSkinHint, type SkinId, type Tier } from "../progress";
import { SkinPicker } from "./SkinPicker";

const TIERS = Object.keys(TIER_LABELS) as Tier[];

/** "Wed", from a Malaysian calendar day (a date with no time, read as UTC so it cannot shift). */
const dayName = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });

/**
 * The pull around the game (D774): the pilot rank, the streak dots, and the skins. All of it is
 * decoration: it is read from the view and never feeds the score (D767).
 */
export function Progress({ view, slug, token, onSkin }: {
  view: QualifierView; slug: string; token: string; onSkin(skin: SkinId | null): void;
}) {
  const { tier, streak, dots, skins, skin, runs, best } = view.me;
  const hint = nextSkinHint({ runs, streak, best });
  return (
    <section aria-label="Your progress" className="flex w-full flex-col gap-4 rounded-3xl bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Pilot rank</h2>
        <ol className="grid grid-cols-4 gap-1.5" aria-label={`Rank: ${TIER_LABELS[tier]}`}>
          {TIERS.map((t) => (
            <li key={t} aria-current={t === tier ? "true" : undefined}
              className={`truncate rounded-lg px-1 py-2 text-center text-xs font-bold ${t === tier ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {TIER_LABELS[t]}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Streak</h2>
          <p className="text-sm font-bold tabular-nums">{streak === 0 ? "No streak yet" : `${streak}-day streak`}</p>
        </div>
        <ol className="flex gap-1.5" aria-label="Days you flew">
          {dots.map((d) => (
            <li key={d.day} className="flex flex-1 flex-col items-center gap-1">
              <span role="img" aria-label={`${dayName(d.day)} ${d.done ? "flown" : "not flown"}`}
                className={`size-6 rounded-full border-2 ${d.done ? "border-primary bg-primary" : "border-muted-foreground/40 bg-transparent"}`} />
              <span aria-hidden className="text-[0.65rem] text-muted-foreground">{dayName(d.day)}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Ship colour</h2>
        <SkinPicker slug={slug} token={token} skins={skins} skin={skin} onChosen={onSkin} />
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
    </section>
  );
}
