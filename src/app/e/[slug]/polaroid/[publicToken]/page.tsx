import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Activity } from "@/lib/types";
import {
  walkinPage, readPolaroidSettings, stickerTray, PolaroidComposer, startWalkinPolaroidAction, postWalkinPolaroidAction,
} from "@/features/polaroid";

// Never cached: whether the link is on, and whether posting is paused, can change at any moment.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Polaroid wall", robots: { index: false, follow: false } };

/** The wall's QR lands here (D481): no login, posts are anonymous. */
export default async function WalkinPolaroidPage({ params }: { params: Promise<{ slug: string; publicToken: string }> }) {
  const { slug, publicToken } = await params;
  const page = await walkinPage(slug, publicToken);
  if (page.kind === "missing") notFound();
  return (
    <main className="min-h-dvh bg-zinc-950 px-4 py-6 text-white">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-white/50">{page.eventName}</p>
        {page.kind === "closed"
          ? <Closed title={page.title} body={page.body} />
          : <Composer activity={page.activity} slug={slug} publicToken={publicToken} />}
      </div>
    </main>
  );
}

function Closed({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl bg-white/5 p-8 text-center">
      <h1 className="text-xl font-extrabold">{title}</h1>
      <p className="mt-2 text-white/70">{body}</p>
    </div>
  );
}

function Composer({ activity, slug, publicToken }: { activity: Activity; slug: string; publicToken: string }) {
  const settings = readPolaroidSettings(activity.polaroid);
  return (
    <PolaroidComposer prompt={settings.prompt} stickers={stickerTray(settings)}
      start={startWalkinPolaroidAction.bind(null, slug, publicToken)}
      post={postWalkinPolaroidAction.bind(null, slug, publicToken)} />
  );
}
