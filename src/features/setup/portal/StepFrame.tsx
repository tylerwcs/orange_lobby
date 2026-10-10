"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "../status";
import type { StepControls } from "./useSectionAutosave";

/** One short group of a step's fields, with a sentence of help from the guide (D446). */
export function StepGroup({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="font-extrabold">{title}</h2>
        <p className="text-sm text-muted-foreground">{help}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * A setup step's page (D446, D460): the title row with its status and a quiet "Saved", the
 * step's fields, a sticky Submit bar, and the phone preview - beside the form on a laptop, behind
 * a Preview button on a phone (D445).
 */
export function StepFrame({ token, title, step, complete, incompleteHint = "Fill in the required fields to submit.", preview, children }: {
  token: string;
  title: string;
  step: StepControls;
  complete: boolean;
  incompleteHint?: string;
  preview: React.ReactNode;
  children: React.ReactNode;
}) {
  const { save, message, status, unsubmitted, submitting, nothingNew, submit } = step;
  const [showPreview, setShowPreview] = useState(false);
  const closePreview = useRef<HTMLButtonElement>(null);

  // The phone preview overlay: Close takes focus when it opens, Escape closes it.
  useEffect(() => {
    if (!showPreview) return;
    closePreview.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowPreview(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showPreview]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/setup/${token}`} className="text-sm font-bold text-primary">‹ Checklist</Link>
          <h1 className="text-2xl font-extrabold">{title}</h1>
          <Badge variant={status === "applied" ? "success" : status === "submitted" ? "warning" : "secondary"}>{STATUS_LABELS[status]}</Badge>
          <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
            {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : ""}
          </span>
        </div>
        {status === "applied" && !unsubmitted && <p className="text-sm text-muted-foreground">Live in your portal. You can still change anything here and submit again.</p>}
        {unsubmitted && status !== "draft" && <p className="text-sm font-semibold text-amber-700">You have changes you haven&apos;t submitted.</p>}

        {children}

        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
          <Button type="button" onClick={submit} disabled={!complete || nothingNew || submitting || save === "saving"}>
            {submitting ? "Submitting…" : status === "draft" || status === "not_started" ? "Submit section" : "Submit changes"}
          </Button>
          <Button type="button" variant="outline" className="lg:hidden" onClick={() => setShowPreview(true)}>Preview</Button>
          {message && <span role="status" className={`text-sm ${message.tone === "error" ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{message.text}</span>}
          {!complete && !message && <span className="text-sm text-muted-foreground">{incompleteHint}</span>}
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-6 flex flex-col gap-2">
          <p className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">Your portal, as attendees see it</p>
          {preview}
        </div>
      </aside>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/95 p-4 lg:hidden" role="dialog" aria-label="Preview">
          {preview}
          <Button ref={closePreview} type="button" variant="outline" onClick={() => setShowPreview(false)}>Close preview</Button>
        </div>
      )}
    </div>
  );
}
