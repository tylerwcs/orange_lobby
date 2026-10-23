import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { Activity } from "@/lib/types";
import {
  walkinPage, readPolaroidSettings, cardLook, stickerTray, PolaroidComposer, StageGlow, STAGE_BG, startWalkinPolaroidAction, postWalkinPolaroidAction,
} from "@/features/polaroid";

// Never cached: whether the link is on, and whether posting is paused, can change at any moment.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Polaroid wall", robots: { index: false, follow: false } };
// The camera fills the screen edge to edge and pads itself by the safe areas (D482).
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: STAGE_BG };

/** The wall's QR lands here (D481): no login, posts are anonymous. The page is the camera (D482). */
export default async function WalkinPolaroidPage({ params }: { params: Promise<{ slug: string; publicToken: string }> }) {
  const { slug, publicToken } = await params;
  const page = await walkinPage(slug, publicToken);
  if (page.kind === "missing") notFound();
  return (
    <main className="min-h-dvh text-white" style={{ background: STAGE_BG }}>
      {page.kind === "closed"
        ? <Closed eventName={page.eventName} brand={page.brand} title={page.title} body={page.body} />
        : <Composer eventName={page.eventName} brand={page.brand} activity={page.activity} slug={slug} publicToken={publicToken} />}
    </main>
  );
}

/** "Posting is paused" and the like, on the same dark stage as the camera. */
function Closed({ eventName, brand, title, body }: { eventName: string; brand: string; title: string; body: string }) {
  return (
    <div className="fixed inset-0 h-dvh overflow-hidden" style={{ background: STAGE_BG }}>
      <StageGlow brand={brand} />
      <div className="relative flex size-full flex-col items-center justify-center gap-3 text-center"
        style={{ padding: "env(safe-area-inset-top) max(1.5rem, env(safe-area-inset-right)) env(safe-area-inset-bottom) max(1.5rem, env(safe-area-inset-left))" }}>
        <p className="text-xs font-bold uppercase tracking-widest text-white/50">{eventName}</p>
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <p className="max-w-sm text-white/70">{body}</p>
      </div>
    </div>
  );
}

function Composer({ eventName, brand, activity, slug, publicToken }: { eventName: string; brand: string; activity: Activity; slug: string; publicToken: string }) {
  const settings = readPolaroidSettings(activity.polaroid);
  return (
    <PolaroidComposer prompt={settings.prompt} stickers={stickerTray(settings)} eventName={eventName} brand={brand}
      look={cardLook(settings.card)} start={startWalkinPolaroidAction.bind(null, slug, publicToken)}
      post={postWalkinPolaroidAction.bind(null, slug, publicToken)} />
  );
}
