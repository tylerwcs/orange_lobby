import Link from "next/link";
import { requireEventAccess } from "@/lib/access";
import { listGames, GAME_KIND_LABELS, gameSummary, type GameKind, type NewGameKind, NewGameMenu } from "@/features/games";
import { appBaseUrl, displayLink, hostLink } from "@/lib/links";
import { crewLinkLastDay } from "@/lib/crew";
import { shortDate } from "@/lib/text";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { RowActions } from "@/components/admin/RowActions";
import { ShareLink } from "@/components/admin/ShareLink";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { eventFeatures, gameKindsFor, has, NotInEvent } from "@/features/catalogue";
import { boardSize, GAME_NAME, getSettings, phaseSubtitle, slimeAdminPath } from "@/features/qualifier";
import { createGameAction, deleteGameAction, rotateDisplayTokenAction, rotateHostTokenAction } from "./actions";
import { addSlimeAction, removeSlimeAction } from "./slime-splat/actions";

export const metadata = { title: "Games" };

// How each kind reads in the empty-state sentence. Typed so a new kind fails the build.
const EMPTY_STATE_PHRASE: Record<NewGameKind, string> = {
  tap_race: "a tap race",
  survival: "last one standing",
  draw: "a lucky draw",
  slime: GAME_NAME,
};

// Outside the component, as the display and host pages read their clock: the lint rule for
// render purity does not follow a call into a helper.
const slimeStatusNow = (s: Awaited<ReturnType<typeof getSettings>>) => phaseSubtitle(s, Date.now());

/**
 * The event's games (D797, D809): one list and one New game menu for the live games and draws
 * run on the stage and for Slime Splat, the typing game attendees play on their own (one per
 * event, listed first once added). The host and display links only when the event has stage games.
 */
export default async function Games({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, ev } = await requireEventAccess(id);
  const features = await eventFeatures(ev.id);
  const kinds = gameKindsFor(features);
  const slimeOn = has(features, "typing_qualifier");
  if (kinds.length === 0 && !slimeOn) {
    return <NotInEvent eventId={ev.id} title="Games" keys={["live_games", "lucky_draw", "typing_qualifier"]} back={`/admin/events/${ev.id}/games`} canTurnOn={actor.kind === "admin"} />;
  }
  // A game of a kind this event no longer has is kept (D439), but not listed.
  const [all, slimeSettings] = await Promise.all([
    kinds.length ? listGames(ev.id) : Promise.resolve([]),
    slimeOn ? getSettings(ev.id) : Promise.resolve(null),
  ]);
  const games = all.filter((g) => kinds.includes(g.kind));
  // Slime Splat is in the list once its settings row exists (D809).
  const slimePlayers = slimeSettings ? await boardSize(ev.id) : 0;
  const newKinds: NewGameKind[] = [...kinds, ...(slimeOn && !slimeSettings ? ["slime" as const] : [])];
  const count = games.length + (slimeSettings ? 1 : 0);
  const base = appBaseUrl();
  // The host and display links expire the way the crew link does.
  const lastDay = crewLinkLastDay(ev);
  const expiry = lastDay ? `Stops working after ${shortDate(lastDay)}.` : "Does not expire, because the event has no dates.";

  const form = (kind: GameKind) => (
    <form action={createGameAction.bind(null, ev.id, kind)} className="grid grid-cols-1 gap-4">
      <Field label="Name" name="title" defaultValue={GAME_KIND_LABELS[kind]} />
      <SubmitButton>Create</SubmitButton>
    </form>
  );
  const slimeForm = (
    <form action={addSlimeAction.bind(null, ev.id)} className="grid grid-cols-1 gap-4">
      <SubmitButton>Add</SubmitButton>
    </form>
  );
  const slimeHref = slimeAdminPath(ev.id);

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title="Games"
        subtitle={count ? `${count} game${count === 1 ? "" : "s"} ready` : "Games attendees play from their phones."}
        actions={newKinds.length > 0 && <NewGameMenu kinds={newKinds} forms={{ tap_race: form("tap_race"), survival: form("survival"), draw: form("draw"), slime: slimeForm }} />}
      />

      <Card className="overflow-hidden py-0">
        <CardContent className="px-0">
          {count === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No games yet. Use New game to add {new Intl.ListFormat("en", { type: "disjunction" }).format(newKinds.map((k) => EMPTY_STATE_PHRASE[k]))}.</p>
          ) : (
            <ul className="divide-y divide-border">
              {slimeSettings && (
                <li className="flex items-center gap-3 px-4 py-3">
                  <Link href={slimeHref} className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-bold">{GAME_NAME}</span>
                    <span className="text-xs text-muted-foreground">{slimeStatusNow(slimeSettings)} · {slimePlayers} {slimePlayers === 1 ? "player" : "players"} on the leaderboard</span>
                  </Link>
                  <Badge variant="secondary">Typing</Badge>
                  <RowActions
                    name={GAME_NAME}
                    links={[{ label: "Edit", href: slimeHref }]}
                    remove={{
                      label: "Remove",
                      action: removeSlimeAction.bind(null, ev.id),
                      message: `Remove ${GAME_NAME}? Attendees can't play it any more. Its leaderboard is kept and comes back if you add it again.`,
                    }}
                  />
                </li>
              )}
              {games.map((g) => {
                const href = `/admin/events/${ev.id}/games/${g.id}`;
                return (
                  <li key={g.id} className="flex items-center gap-3 px-4 py-3">
                    <Link href={href} className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-bold">{g.title}</span>
                      <span className="text-xs text-muted-foreground">{gameSummary(g)}</span>
                    </Link>
                    <Badge variant="secondary">{GAME_KIND_LABELS[g.kind]}</Badge>
                    <RowActions
                      name={g.title}
                      links={[{ label: "Edit", href }]}
                      remove={{
                        action: deleteGameAction.bind(null, ev.id, g.id),
                        message: g.kind === "draw"
                          ? `Delete "${g.title}"? Its winners list goes with it, and those winners can win other draws again.`
                          : `Delete "${g.title}"? Its results go with it.`,
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {kinds.length > 0 && <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Host link</CardTitle>
            <CardDescription>For whoever runs the games — crew or the emcee — on their phone. Anyone holding it can start games and draw winners.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {ev.host_token ? (
              <>
                <ShareLink label="Host" url={hostLink(base, ev.host_token)} />
                <p className="text-xs tabular-nums text-muted-foreground">{expiry}</p>
                <form action={rotateHostTokenAction.bind(null, ev.id)}>
                  <ConfirmButton message="Replace the host link? The old one stops working immediately.">Replace link</ConfirmButton>
                </form>
              </>
            ) : (
              <form action={rotateHostTokenAction.bind(null, ev.id)}><SubmitButton>Create host link</SubmitButton></form>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Display link</CardTitle>
            <CardDescription>Open on the computer that feeds the LED, in Chrome, and click to start. It only shows; it cannot control anything.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {ev.display_token ? (
              <>
                <ShareLink label="Display" url={displayLink(base, ev.display_token)} />
                <p className="text-xs tabular-nums text-muted-foreground">{expiry}</p>
                <form action={rotateDisplayTokenAction.bind(null, ev.id)}>
                  <ConfirmButton message="Replace the display link? The screen showing the old one goes blank until it is reopened with the new one.">Replace link</ConfirmButton>
                </form>
              </>
            ) : (
              <form action={rotateDisplayTokenAction.bind(null, ev.id)}><SubmitButton>Create display link</SubmitButton></form>
            )}
          </CardContent>
        </Card>
      </div>}
    </div>
  );
}
