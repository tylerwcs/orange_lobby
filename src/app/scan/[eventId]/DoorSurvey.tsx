"use client";
import { startTransition, useActionState } from "react";
import { ClipboardList } from "lucide-react";
import { submitDoorSurveyAction } from "./actions";
import { HealthConsentField, SubmissionFields } from "@/features/activities/client";
import type { RegistrationQuestion } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** D763: what the scanner needs to draw a door's survey. The description is sanitised by the page. */
export type DoorSurveyForm = { id: string; name: string; descriptionHtml: string; questions: RegistrationQuestion[]; health_data: boolean };

/**
 * D763: the door's survey over the whole scanner, for one person, on the crew's device - handed
 * over, or read out. Keyed by attendee where it is placed, so nothing typed for one person is
 * ever on screen for the next; it unmounts on Submit and on Skip, and the answers never come back.
 */
export function DoorSurvey({ eventId, checkpointId, crewToken, form, attendee, needsConsent, onSaved, onSkip }: {
  eventId: string;
  checkpointId: string;
  crewToken?: string;
  form: DoorSurveyForm;
  attendee: { id: string; name: string };
  needsConsent: boolean;
  onSaved: () => void;
  onSkip: () => void;
}) {
  const [error, send, pending] = useActionState(async (_prev: string | null, fd: FormData): Promise<string | null> => {
    try {
      const r = await submitDoorSurveyAction(eventId, checkpointId, attendee.id, fd, crewToken);
      if (r.ok) { onSaved(); return null; }
      return r.error;
    } catch {
      return "The survey didn't reach the server. Check the connection and try again.";
    }
  }, null);

  // Sent from onSubmit, not as the form's action: an action resets the form when it settles,
  // and a refused survey must keep what was typed so crew can fix it or Skip.
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => send(fd));
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="door-survey-title" className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <form onSubmit={submit} className="mx-auto flex min-h-full w-full max-w-xl flex-col gap-5 p-4 lg:p-6">
        <header className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
            <ClipboardList className="size-4" aria-hidden="true" />
            {form.name}
          </p>
          <h1 id="door-survey-title" className="text-2xl font-extrabold leading-tight text-balance">{attendee.name}</h1>
        </header>
        {form.descriptionHtml && <div className="rich-text prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: form.descriptionHtml }} />}
        {needsConsent && <HealthConsentField id="door-survey-consent" />}
        <SubmissionFields questions={form.questions} />
        <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-2 border-t border-border bg-background px-4 py-3 lg:-mx-6 lg:px-6">
          {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending} className="h-12 flex-1 text-base font-bold">
              {pending && <Spinner data-icon="inline-start" />}
              Submit
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={onSkip} className="h-12 px-5 text-base font-bold">
              Skip
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
