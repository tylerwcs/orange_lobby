"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { basicsComplete, basicsErrors, BASICS_LABELS, type BasicsAnswers, type BasicsField } from "../sections/basics";
import { sameAnswers, STATUS_LABELS, type SectionStatus } from "../status";
import { HomePreview, type PreviewSlot } from "../preview/HomePreview";
import { SetupImageField } from "./SetupImageField";
import { saveSectionAction, submitSectionAction } from "./actions";

const SLOT_OF: Partial<Record<BasicsField, PreviewSlot>> = {
  name: "header", starts_on: "header", ends_on: "header", venue_name: "header",
  primary_color: "colour", logo_url: "logo", banner_url: "banner",
};
const FIELD_OF: Record<PreviewSlot, BasicsField> = { header: "name", logo: "logo_url", banner: "banner_url", colour: "primary_color" };
const AUTOSAVE_MS = 1000;
const RETRY_MS = 5000;
const SAVE_FAILED = "We couldn't save — check your connection. We'll try again in a few seconds.";
const SAVE_FAILED_AGAIN = "We still couldn't save — check your connection. Change anything to try again.";
const SUBMIT_FAILED = "Couldn't submit — check your connection and try again.";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Event basics (D446): short groups with a line of help each, saved about a second after the
 * last change, next to the portal home it shapes (D445). Saves run one at a time, each carrying
 * the rev the last one returned, so a second person's save is refused instead of overwritten.
 * Nothing is lost quietly: leaving the page sends a pending save (and the browser asks first
 * while one is unsent or in flight), and a failed save is retried once a few seconds later.
 */
export function BasicsStep({ token, initial, initialRev, initialStatus, initialUnsubmitted }: {
  token: string;
  initial: BasicsAnswers;
  initialRev: number;
  initialStatus: SectionStatus;
  initialUnsubmitted: boolean;
}) {
  const [a, setA] = useState(initial);
  const [focused, setFocused] = useState<PreviewSlot | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [message, setMessage] = useState<{ text: string; tone: "error" | "info" } | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [unsubmitted, setUnsubmitted] = useState(initialUnsubmitted);
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const rev = useRef(initialRev);
  const latest = useRef(initial);
  // What the server holds. Comparing against it (not "is this the first render") means opening
  // the page never saves, even when React runs effects twice in development.
  const saved = useRef(initial);
  // Read inside the chain, which can run after a render that changed the status.
  const statusRef = useRef(initialStatus);
  // Every save and submit runs on this chain, one at a time. Each step catches its own errors,
  // so the chain always stays fulfilled and the next step always runs.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const blocked = useRef(false);
  // A save or submit request on the wire: leaving now could lose it.
  const inFlight = useRef(false);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const closePreview = useRef<HTMLButtonElement>(null);

  const errors = basicsErrors(a);
  const complete = basicsComplete(a);
  const nothingNew = (status === "submitted" || status === "applied") && !unsubmitted;

  /**
   * One save, when there's something to send. Only ever called from a chain step. `force` sends
   * even unchanged answers while no row exists yet (rev 0), so submitting the untouched prefill
   * has a row to submit. `isRetry` marks the one automatic retry, whose failure says so.
   * True when the server now holds the latest answers.
   */
  const saveStep = useCallback(async (force: boolean, isRetry = false): Promise<boolean> => {
    if (blocked.current) return false;
    if (!(force && rev.current === 0) && sameAnswers(latest.current, saved.current)) return true;
    const sending = latest.current;
    setSave("saving");
    inFlight.current = true;
    try {
      const r = await saveSectionAction(token, "basics", rev.current, sending);
      if (r.ok) {
        rev.current = r.rev;
        saved.current = sending;
        setSave("saved");
        setMessage(null);
        if (statusRef.current === "submitted" || statusRef.current === "applied") setUnsubmitted(true);
        return true;
      }
      setSave("error");
      setMessage({ text: r.message, tone: "error" });
      if (r.stale) blocked.current = true;
      return false;
    } catch {
      setSave("error");
      setMessage({ text: isRetry ? SAVE_FAILED_AGAIN : SAVE_FAILED, tone: "error" });
      return false;
    } finally {
      inFlight.current = false;
    }
  }, [token]);

  const cancelRetry = useCallback(() => {
    if (retry.current) clearTimeout(retry.current);
    retry.current = null;
  }, []);

  /** After a failed save (not a stale one), one more try in a few seconds. The retry doesn't schedule another. */
  const scheduleRetry = useCallback(() => {
    cancelRetry();
    if (!mounted.current || blocked.current) return;
    retry.current = setTimeout(() => {
      retry.current = null;
      chain.current = chain.current.then(async () => { await saveStep(false, true); });
    }, RETRY_MS);
  }, [cancelRetry, saveStep]);

  const runSave = useCallback(() => {
    chain.current = chain.current.then(async () => {
      if (!(await saveStep(false))) scheduleRetry();
    });
    return chain.current;
  }, [saveStep, scheduleRetry]);

  // Leaving: the browser asks first while something is unsent or on the wire, a page hide sends
  // what's pending, and so does leaving within the app (unmount), which the browser can't catch.
  useEffect(() => {
    mounted.current = true;
    const unsaved = () => !sameAnswers(latest.current, saved.current);
    const flush = () => { if (unsaved()) void runSave(); };
    const warn = (e: BeforeUnloadEvent) => {
      if (!inFlight.current && !unsaved()) return;
      e.preventDefault();
      e.returnValue = true;
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("pagehide", flush);
      mounted.current = false;
      cancelRetry();
      flush();
    };
  }, [runSave, cancelRetry]);

  useEffect(() => {
    latest.current = a;
    // An edit replaces the pending retry: the debounced save below sends the newer answers.
    cancelRetry();
    if (sameAnswers(a, saved.current)) return;
    const t = setTimeout(() => { void runSave(); }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [a, runSave, cancelRetry]);

  // The phone preview overlay: Close takes focus when it opens, Escape closes it.
  useEffect(() => {
    if (!showPreview) return;
    closePreview.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowPreview(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showPreview]);

  const set = (f: BasicsField) => (v: string) => setA((p) => ({ ...p, [f]: v }));
  const focus = (f: BasicsField) => () => setFocused(SLOT_OF[f] ?? null);
  const jump = (slot: PreviewSlot) => {
    setFocused(slot);
    document.querySelector<HTMLElement>(`[data-setup-field="${FIELD_OF[slot]}"]`)?.focus();
  };

  // On the same chain as the saves, so a debounced save can't go out with the rev submit uses.
  const submit = () => {
    setSubmitting(true);
    latest.current = a;
    chain.current = chain.current.then(async () => {
      try {
        if (!(await saveStep(true))) {
          scheduleRetry();
          return;
        }
        inFlight.current = true;
        const r = await submitSectionAction(token, "basics", rev.current);
        if (r.ok) {
          rev.current = r.rev;
          statusRef.current = "submitted";
          setStatus("submitted");
          setUnsubmitted(false);
          setMessage({ text: "Submitted. We'll review it and let you know if anything needs changing.", tone: "info" });
        } else {
          if (r.stale) blocked.current = true;
          setMessage({ text: r.message, tone: "error" });
        }
      } catch {
        setMessage({ text: SUBMIT_FAILED, tone: "error" });
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    });
  };

  const text = (f: BasicsField, type = "text", placeholder = "") => (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{BASICS_LABELS[f]}</span>
      <Input type={type} value={a[f]} placeholder={placeholder} data-setup-field={f} onFocus={focus(f)} onChange={(e) => set(f)(e.target.value)}
        aria-invalid={errors[f] ? true : undefined} className={type === "date" ? "w-44" : ""} />
      {errors[f] && <span className="text-xs font-semibold text-destructive">{errors[f]}</span>}
    </label>
  );
  const area = (f: BasicsField, placeholder: string, rows = 3) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{BASICS_LABELS[f]}</span>
      <Textarea value={a[f]} rows={rows} placeholder={placeholder} data-setup-field={f} onFocus={focus(f)} onChange={(e) => set(f)(e.target.value)}
        aria-invalid={errors[f] ? true : undefined} />
      {errors[f] && <span className="text-xs font-semibold text-destructive">{errors[f]}</span>}
    </label>
  );
  const group = (title: string, help: string, children: React.ReactNode) => (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="font-extrabold">{title}</h2>
        <p className="text-sm text-muted-foreground">{help}</p>
      </div>
      {children}
    </section>
  );

  const preview = <HomePreview basics={a} focused={focused} onSlot={jump} />;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/setup/${token}`} className="text-sm font-bold text-primary">‹ Checklist</Link>
          <h1 className="text-2xl font-extrabold">Event basics</h1>
          <Badge variant={status === "applied" ? "success" : status === "submitted" ? "warning" : "secondary"}>{STATUS_LABELS[status]}</Badge>
          <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
            {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : ""}
          </span>
        </div>
        {status === "applied" && !unsubmitted && <p className="text-sm text-muted-foreground">Live in your portal. You can still change anything here and submit again.</p>}
        {unsubmitted && status !== "draft" && <p className="text-sm font-semibold text-amber-700">You have changes you haven&apos;t submitted.</p>}

        {group("Your event", "Shown at the top of the portal and in WhatsApp messages. All times are Malaysia time.", (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{text("name", "text", "Ecopia Kick-Off Meeting 2027")}</div>
            {text("starts_on", "date")}
            {text("ends_on", "date")}
            <div className="sm:col-span-2">{text("venue_name", "text", "Sunway Pyramid Convention Centre")}</div>
          </div>
        ))}

        {group("How it looks", "Send each image at about twice its on-screen size so it stays sharp on phones.", (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">{BASICS_LABELS.primary_color}</span>
              <span className="flex items-center gap-2">
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(a.primary_color) ? a.primary_color : "#F97316"} onFocus={focus("primary_color")}
                  onChange={(e) => set("primary_color")(e.target.value)} className="h-9 w-14 cursor-pointer rounded-md border border-input" aria-label="Pick a colour" />
                <Input value={a.primary_color} data-setup-field="primary_color" onFocus={focus("primary_color")} onChange={(e) => set("primary_color")(e.target.value)} className="w-28 font-mono" />
              </span>
              {errors.primary_color && <span className="text-xs font-semibold text-destructive">{errors.primary_color}</span>}
            </label>
            <SetupImageField token={token} kind="logo" label={BASICS_LABELS.logo_url} value={a.logo_url} onChange={set("logo_url")} onFocus={focus("logo_url")} />
            <SetupImageField token={token} kind="banner" label={BASICS_LABELS.banner_url} value={a.banner_url} onChange={set("banner_url")} onFocus={focus("banner_url")} />
          </div>
        ))}

        {group("People", "Categories decide who sees what. The committee numbers get WhatsApp alerts when attendees ask to change a booking.", (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{area("categories", "One per line, e.g.\nStaff\nVendor\nVIP")}</div>
            <div className="sm:col-span-2">{area("committee_numbers", "One per line, e.g.\n012-345 6789")}</div>
          </div>
        ))}

        {group("Anything else", "Anything we should know that isn't asked above.", area("notes", "", 4))}

        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
          <Button type="button" onClick={submit} disabled={!complete || nothingNew || submitting || save === "saving"}>
            {submitting ? "Submitting…" : status === "draft" || status === "not_started" ? "Submit section" : "Submit changes"}
          </Button>
          <Button type="button" variant="outline" className="lg:hidden" onClick={() => setShowPreview(true)}>Preview</Button>
          {message && <span role="status" className={`text-sm ${message.tone === "error" ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{message.text}</span>}
          {!complete && !message && <span className="text-sm text-muted-foreground">Fill in the required fields to submit.</span>}
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
