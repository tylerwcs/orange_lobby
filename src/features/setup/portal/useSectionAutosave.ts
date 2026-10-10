"use client";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { SetupSection } from "../sections";
import { sameAnswers, type SectionStatus } from "../status";
import { saveSectionAction, submitSectionAction } from "./actions";

const AUTOSAVE_MS = 1000;
const RETRY_MS = 5000;
const SAVE_FAILED = "We couldn't save — check your connection. We'll try again in a few seconds.";
const SAVE_FAILED_AGAIN = "We still couldn't save — check your connection. Change anything to try again.";
const SUBMIT_FAILED = "Couldn't submit — check your connection and try again.";

export type SaveState = "idle" | "saving" | "saved" | "error";
export type StepMessage = { text: string; tone: "error" | "info" };
export type StepControls = {
  save: SaveState;
  message: StepMessage | null;
  status: SectionStatus;
  unsubmitted: boolean;
  submitting: boolean;
  /** Submitted (or applied) and nothing changed since: Submit has nothing to send. */
  nothingNew: boolean;
  submit: () => void;
};

/**
 * A step's answers, saved about a second after the last change (D446, D460). Saves run one at a
 * time, each carrying the rev the last one returned, so a second person's save is refused instead
 * of overwritten. Nothing is lost quietly: leaving the page sends a pending save (and the browser
 * asks first while one is unsent or in flight), and a failed save is retried once a few seconds later.
 */
export function useSectionAutosave<T>({ token, section, initial, initialRev, initialStatus, initialUnsubmitted, seed }: {
  token: string;
  section: SetupSection;
  initial: T;
  initialRev: number;
  initialStatus: SectionStatus;
  initialUnsubmitted: boolean;
  /**
   * What the form showed when the page opened (D450, D454). The first save (rev 0) uses it as the
   * baseline for the first Apply, so it is the page-load answers, never the current ones.
   */
  seed?: unknown;
}): StepControls & { answers: T; setAnswers: Dispatch<SetStateAction<T>> } {
  const [a, setA] = useState(initial);
  const [save, setSave] = useState<SaveState>("idle");
  const [message, setMessage] = useState<StepMessage | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [unsubmitted, setUnsubmitted] = useState(initialUnsubmitted);
  const [submitting, setSubmitting] = useState(false);
  const rev = useRef(initialRev);
  const seedRef = useRef(seed);
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
      const r = await saveSectionAction(token, section, rev.current, sending, rev.current === 0 ? seedRef.current : undefined);
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
  }, [token, section]);

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
        const r = await submitSectionAction(token, section, rev.current);
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

  return { answers: a, setAnswers: setA, save, message, status, unsubmitted, submitting, nothingNew, submit };
}
