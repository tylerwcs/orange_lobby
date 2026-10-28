import { loadPortalEvent, portalHasInfo } from "@/lib/portal";
import { loadHomeData } from "@/lib/portal-home";
import { PortalShell } from "@/components/portal/PortalShell";
import { AnnouncementBanner } from "@/components/portal/AnnouncementBanner";
import { LauncherGrid } from "@/components/portal/LauncherGrid";
import { launcherItems, sectionIcons } from "@/lib/launcher";
import { AgendaList } from "@/components/portal/AgendaList";
import { AnnouncementList } from "@/components/portal/AnnouncementList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCode } from "lucide-react";
import { portalLang, t } from "@/features/language";

export const dynamic = "force-dynamic";

const caption = "text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground";

export default async function GenericHome({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const { day: requestedDay } = await searchParams;
  const event = await loadPortalEvent(slug);
  const basePath = `/e/${slug}`;
  const [{ tiles, banner, agenda, days, day, announcements, now }, hasInfo, lang] = await Promise.all([
    loadHomeData(event, null, basePath, requestedDay),
    portalHasInfo(event.id, null),
    portalLang(event),
  ]);
  const d = t(lang);
  const launcher = launcherItems({ basePath, personal: false, hasInfo, infoLabel: event.info_page_title, tiles, icons: sectionIcons(event.section_icons), tint: event.primary_color, lang });

  return (
    <PortalShell event={event} basePath={basePath} personal={false} current="" hero dashboard>
      <h1 className="sr-only">{event.name}</h1>

      {/* Same three columns as the badge home; the identity card is the one difference,
          because this reader has not opened their own link yet. */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-5 xl:grid-cols-[300px_minmax(0,1fr)_300px]">

        <div className="flex flex-col gap-4 md:gap-5">
          <Card>
            <CardContent className="flex flex-col gap-2">
              <QrCode className="size-6 text-primary" />
              <div className="font-extrabold">{d.home.ownBadgeTitle}</div>
              <p className="text-sm text-muted-foreground">{d.home.ownBadgeBody}</p>
            </CardContent>
          </Card>
          {/* Phone: the latest announcement and the launcher, which is the navigation there (D209). */}
          {banner && <div className="md:hidden"><AnnouncementBanner a={banner} items={announcements} /></div>}
          <LauncherGrid lang={lang} items={launcher} layout="row" className="md:hidden" />
        </div>

        <div className="hidden md:flex md:flex-col md:gap-5">
          <Card>
            <CardHeader>
              <CardTitle>{d.home.today}</CardTitle>
            </CardHeader>
            <CardContent>
              <AgendaList
                lang={lang}
                items={agenda}
                day={day}
                days={days}
                basePath={basePath}
                now={now}
                dayHref={(d) => `${basePath}?day=${d}`}
              />
            </CardContent>
          </Card>
        </div>

        <div className="hidden md:col-span-2 md:flex md:flex-col md:gap-5 xl:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className={caption}>{d.home.announcements}</CardTitle>
            </CardHeader>
            <CardContent>
              <AnnouncementList lang={lang} items={announcements.slice(0, 4)} />
            </CardContent>
          </Card>
          <LauncherGrid lang={lang} items={launcher.filter((i) => !i.builtin)} />
        </div>

      </div>
    </PortalShell>
  );
}
