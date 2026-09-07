import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/db/events";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  const closed = !event.registration_open || (event.registration_closes_at && new Date(event.registration_closes_at) < new Date());
  return (
    <main className="mx-auto max-w-md p-4" style={{ ["--brand" as string]: event.primary_color }}>
      {event.banner_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.banner_url} alt="" className="mb-4 w-full rounded-lg" />
      )}
      <h1 className="mb-1 text-xl font-semibold">{event.name}</h1>
      <p className="mb-6 text-sm text-gray-600">Registration</p>
      {closed ? <p className="rounded bg-gray-100 p-4 text-sm">Registration is closed.</p>
              : <RegisterForm slug={slug} questions={event.registration_questions} />}
    </main>
  );
}
