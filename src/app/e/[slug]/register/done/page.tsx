import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/db/events";
import { findByToken } from "@/lib/db/attendees";
import { appBaseUrl, attendeeLink } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";

export default async function Done({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t } = await searchParams;
  const event = await getEventBySlug(slug);
  if (!event || !t) notFound();
  const attendee = await findByToken(event.id, t);
  if (!attendee) notFound();
  const link = attendeeLink(appBaseUrl(), slug, attendee.token);
  const qr = await qrDataUrl(link);
  return (
    <main className="mx-auto max-w-md p-4 text-center">
      <h1 className="mb-2 text-xl font-semibold">You&apos;re registered, {attendee.name.split(" ")[0]}!</h1>
      <p className="mb-4 text-sm text-gray-600">This is your personal event link. Bookmark it or save this page.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="Your QR code" className="mx-auto mb-4 w-56" />
      <a href={link} className="block break-all rounded border p-3 text-sm text-orange-700">{link}</a>
    </main>
  );
}
