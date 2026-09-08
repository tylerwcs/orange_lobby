import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/db/events";
import { RegisterForm } from "./RegisterForm";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { Card } from "@/components/ui/Card";
import { brandStyle } from "@/lib/brand";

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  const closed = !event.registration_open || (event.registration_closes_at && new Date(event.registration_closes_at) < new Date());
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-canvas" style={brandStyle(event.primary_color) as React.CSSProperties}>
      <PortalHeader event={event} />
      <main className="flex-1 px-4 py-4">
        <Card className="p-4">
          <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Registration</div>
          {closed ? <p className="text-sm text-muted">Registration is closed.</p>
                  : <RegisterForm slug={slug} questions={event.registration_questions} />}
        </Card>
      </main>
    </div>
  );
}
