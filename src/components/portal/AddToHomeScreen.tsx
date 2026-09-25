"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { EllipsisVertical, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** The Chrome/Android event that carries the install prompt. Not in the DOM typings. */
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type Platform = "none" | "ios" | "android" | "other";

const DISMISSED = "ecphub:a2hs-dismissed";
/** Long enough for the page to settle and be seen first; short enough to catch a quick visit. */
const OPEN_AFTER_MS = 1500;

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

/** One numbered step. */
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-extrabold text-primary">{n}</span>
      <span className="pt-0.5 text-sm leading-snug">{children}</span>
    </li>
  );
}

const Strong = ({ children }: { children: React.ReactNode }) => <span className="font-bold">{children}</span>;
const inlineIcon = "mx-0.5 inline size-4 align-[-3px] text-primary";

/**
 * A popup asking the attendee to keep their page on the home screen (D227, D230), so on the day
 * it is one tap away instead of buried in a WhatsApp chat. It opens by itself on the first
 * visit to the home page, a moment after the page settles, and never again once closed on that
 * phone - a prompt that comes back every visit teaches people to swat it away unread.
 *
 * The steps depend on what the phone can do:
 * - Chrome on Android fires `beforeinstallprompt`, so the popup has a real Add button.
 * - iOS never offers a prompt to a web page, so the popup walks through Safari's Share sheet.
 * - Other Android browsers - WhatsApp's in-app one above all - may offer neither, so the popup
 *   walks through Chrome's menu, starting with getting the link into Chrome.
 * Nothing opens on a desktop or when the page is already running from the home screen.
 */
export function AddToHomeScreen({ appName }: { appName: string }) {
  const device = useSyncExternalStore(noSubscribe, platform, () => "none" as Platform);
  const [canPrompt, setCanPrompt] = useState(false);
  const [open, setOpen] = useState(false);
  const prompt = useRef<InstallPrompt | null>(null);

  useEffect(() => {
    if (device === "none") return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      prompt.current = e as InstallPrompt;
      setCanPrompt(true);
      setOpen(true);
    };
    const onInstalled = () => setOpen(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // A desktop browser with no prompt gets nothing: it is not where the day happens.
    const timer = device === "ios" || device === "android" ? window.setTimeout(() => setOpen(true), OPEN_AFTER_MS) : undefined;
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [device]);

  // However it closes - Not now, the X, a tap outside - it stays closed on this phone.
  const close = () => {
    try { localStorage.setItem(DISMISSED, "1"); } catch { /* private mode: it simply comes back */ }
    setOpen(false);
  };
  const install = async () => {
    const p = prompt.current;
    if (!p) return;
    await p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === "accepted") close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="gap-5">
        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          {/* What they are about to get: the icon and its label, as the home screen shows them. */}
          <div className="flex flex-col items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/app-icons/icon-192.png" alt="" width={64} height={64} className="size-16 rounded-2xl shadow-[0_2px_10px_rgba(17,24,39,.15)]" />
            <span className="max-w-24 truncate text-[11px] font-semibold text-muted-foreground">{appName}</span>
          </div>
          <DialogTitle className="text-lg font-extrabold leading-tight text-balance">Add your event page to your home screen</DialogTitle>
          <DialogDescription className="text-balance">
            It opens like an app, straight to your badge, agenda and updates. No searching through chats on the day.
          </DialogDescription>
        </div>

        {canPrompt ? (
          <Button className="h-11 w-full text-base font-bold" onClick={install}>Add to home screen</Button>
        ) : device === "ios" ? (
          <ol className="flex flex-col gap-3" aria-label="How to add it on iPhone">
            <Step n={1}>Open this page in <Strong>Safari</Strong>. Came from WhatsApp? Tap <Strong>Share</Strong> or the <Strong>compass</Strong> icon, then <Strong>Open in Safari</Strong>.</Step>
            <Step n={2}>Tap the Share button <Share aria-hidden className={inlineIcon} /> in the bar at the bottom (top right on an iPad).</Step>
            <Step n={3}>Scroll down the list and tap <Strong>Add to Home Screen</Strong> <SquarePlus aria-hidden className={inlineIcon} />.</Step>
            <Step n={4}>Tap <Strong>Add</Strong>. The icon appears on your home screen.</Step>
          </ol>
        ) : (
          <ol className="flex flex-col gap-3" aria-label="How to add it on Android">
            <Step n={1}>Open this page in <Strong>Chrome</Strong>. Came from WhatsApp? Tap the menu <EllipsisVertical aria-hidden className={inlineIcon} />, then <Strong>Open in Chrome</Strong>.</Step>
            <Step n={2}>Tap the menu <EllipsisVertical aria-hidden className={inlineIcon} /> at the top right.</Step>
            <Step n={3}>Tap <Strong>Add to Home screen</Strong> or <Strong>Install app</Strong>.</Step>
            <Step n={4}>Tap <Strong>Add</Strong> or <Strong>Install</Strong>. The icon appears on your home screen.</Step>
          </ol>
        )}

        <Button variant="ghost" className="-mt-2 w-full text-muted-foreground" onClick={close}>Not now</Button>
      </DialogContent>
    </Dialog>
  );
}
