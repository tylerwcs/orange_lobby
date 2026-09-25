"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { EllipsisVertical, Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The Chrome/Android event that carries the install prompt. Not in the DOM typings. */
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type Platform = "none" | "ios" | "android" | "other";

const DISMISSED = "ecphub:a2hs-dismissed";

function wasDismissed(): boolean {
  try { return localStorage.getItem(DISMISSED) === "1"; } catch { return false; }
}

/**
 * What this phone can do, read once on the client. "none" - already on the home screen, closed
 * before, or the server render - shows nothing. A plain string, so the snapshot is stable.
 */
function platform(): Platform {
  const installed = window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (installed || wasDismissed()) return "none";
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; the touch points give it away.
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  return /Android/.test(ua) ? "android" : "other";
}
const noSubscribe = () => () => {};

/**
 * A card asking the attendee to keep their page on the home screen (D227), so on the day it is
 * one tap away instead of buried in a WhatsApp chat.
 *
 * What it says depends on what the phone can do:
 * - Chrome on Android fires `beforeinstallprompt`, so the card has a real button.
 * - iOS never offers a prompt to a web page, so the card says where Safari's option is.
 * - Other Android browsers - WhatsApp's in-app one above all - may offer neither, so the card
 *   says where the menu item usually is and to open the link in Chrome first.
 * Nothing is shown on a desktop, once the page is already running from the home screen, or
 * after the attendee closes it (remembered on this phone only).
 */
export function AddToHomeScreen() {
  const device = useSyncExternalStore(noSubscribe, platform, () => "none" as Platform);
  const [canPrompt, setCanPrompt] = useState(false);
  const [gone, setGone] = useState(false);
  const prompt = useRef<InstallPrompt | null>(null);

  useEffect(() => {
    if (device === "none" || device === "ios") return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      prompt.current = e as InstallPrompt;
      setCanPrompt(true);
    };
    const onInstalled = () => setGone(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [device]);

  // A desktop browser that offers no prompt gets nothing: it is not where the day happens.
  const mode = gone || device === "none" ? "hidden"
    : canPrompt ? "prompt"
    : device === "ios" || device === "android" ? device
    : "hidden";
  if (mode === "hidden") return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISSED, "1"); } catch { /* private mode: it simply comes back */ }
    setGone(true);
  };
  const install = async () => {
    const p = prompt.current;
    if (!p) return;
    await p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === "accepted") setGone(true);
  };

  return (
    <section aria-labelledby="a2hs-title" className="relative flex gap-3 rounded-xl bg-card p-3.5 pr-11 ring-1 ring-foreground/10">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
        <Smartphone aria-hidden className="size-5" />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="a2hs-title" className="text-sm font-extrabold">Add this page to your home screen</h2>
        {mode === "prompt" && (
          <>
            <p className="text-xs text-muted-foreground">It opens like an app, straight to your badge.</p>
            <Button size="sm" className="mt-1 self-start" onClick={install}>Add to home screen</Button>
          </>
        )}
        {mode === "ios" && (
          <p className="text-xs text-muted-foreground">
            In Safari, tap <Share aria-hidden className="inline size-3.5 align-[-2px]" /> Share, then{" "}
            <span className="font-bold text-foreground">Add to Home Screen</span>. Opened from WhatsApp? Open the link in Safari first.
          </p>
        )}
        {mode === "android" && (
          <p className="text-xs text-muted-foreground">
            Open the browser menu <EllipsisVertical aria-hidden className="inline size-3.5 align-[-2px]" /> and choose{" "}
            <span className="font-bold text-foreground">Add to Home screen</span> or <span className="font-bold text-foreground">Install app</span>. Opened from WhatsApp? Open the link in Chrome first.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close"
        className="absolute right-1.5 top-1.5 flex size-9 items-center justify-center rounded-full text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X aria-hidden className="size-4" />
      </button>
    </section>
  );
}
