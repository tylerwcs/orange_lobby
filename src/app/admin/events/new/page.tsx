import { createEventAction } from "../[id]/actions";
import { requireAdmin } from "@/lib/auth";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Sidebar } from "@/components/admin/Sidebar";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "New event · Orange Lobby" };

const STEPS = [
  ["Settings", "Dates, venue, colours, registration questions."],
  ["Modules", "Choose the tiles attendees see on their home screen."],
  ["Checkpoints", "One per day or door, for the crew scanner."],
  ["Attendees", "Import the masterlist or open registration."],
  ["Go live", "Draft links show “Coming soon” until you switch the status."],
];

export default async function NewEvent({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { email } = await requireAdmin();
  return (
    <>
      <Sidebar email={email} />
      <main id="main" className="min-w-0 flex-1 p-3 pt-6 lg:p-6 lg:pt-8 2xl:p-8">
        <h1 className="mb-6 text-2xl font-extrabold">New event</h1>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
          <Card className="p-6">
            <form action={createEventAction} className="space-y-4">
              {error && <p role="alert" className="rounded-[var(--radius-control)] bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <Field label="Event name" name="name" placeholder="Ecopia Kick-Off Meeting 2026" />
              <Field label="Link slug" name="slug" placeholder="auto from the name" />
              <p className="-mt-2 text-xs text-muted">Appears in every attendee link, so it cannot change after badges are printed.</p>
              <SubmitButton>Create event</SubmitButton>
            </form>
          </Card>
          <Card className="p-6">
            <h2 className="text-base font-extrabold">What happens next</h2>
            <ol className="mt-3 space-y-3 text-sm">
              {STEPS.map(([title, note], i) => (
                <li key={title} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-extrabold text-brand-ink">{i + 1}</span>
                  <span><span className="font-bold">{title}.</span> <span className="text-muted">{note}</span></span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </main>
    </>
  );
}
