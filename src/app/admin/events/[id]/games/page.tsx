import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listGames, GAME_KIND_LABELS, gameSummary, type GameKind, NewGameMenu } from "@/features/games";
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
import { createGameAction, deleteGameAction, rotateDisplayTokenAction, rotateHostTokenAction } from "./actions";

export const metadata = { title: "Games" };

export default async function Games({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const games = await listGames(ev.id);
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

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title="Games"
        subtitle={games.length ? `${games.length} game${games.length === 1 ? "" : "s"} ready for the stage` : "Games the room plays from their phones, shown on the LED."}
        actions={<NewGameMenu forms={{ tap_race: form("tap_race"), survival: form("survival"), draw: form("draw") }} />}
      />

      <Card className="overflow-hidden py-0">
        <CardContent className="px-0">
          {games.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No games yet. Use New game to add a tap race, last one standing or a lucky draw.</p>
          ) : (
            <ul className="divide-y divide-border">
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

      <div className="grid gap-4 md:grid-cols-2">
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
      </div>
    </div>
  );
}
