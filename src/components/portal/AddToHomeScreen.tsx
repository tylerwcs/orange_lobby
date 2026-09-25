"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronRight, Ellipsis, EllipsisVertical, Menu, Share, Smartphone, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** The Chrome/Android event that carries the install prompt. Not in the DOM typings. */
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type Platform = "installed" | "ios" | "android" | "other";

const DISMISSED = "ecphub:a2hs-dismissed";
/** Fired by the entry points - the announcements row, the banner - to open the guide on demand. */
const OPEN_EVENT = "ecphub:a2hs-open";
/** Long enough for the page to settle and be seen first; short enough to catch a quick visit. */
const OPEN_AFTER_MS = 1500;

function wasDismissed(): boolean {
  try { return localStorage.getItem(DISMISSED) === "1"; } catch { return false; }
}

/**
 * What this device is, read once on the client; the server render counts as "installed" so
 * nothing about the guide is drawn until the browser has answered. A plain string, so the
 * snapshot is stable.
 */
function platform(): Platform {
  const installed = window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (installed) return "installed";
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; the touch points give it away.
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  return /Android/.test(ua) ? "android" : "other";
}
const noSubscribe = () => () => {};
const useDevice = () => useSyncExternalStore(noSubscribe, platform, () => "installed" as Platform);

/** Opens the guide from anywhere on the page, whether or not it was closed before. */
export function openHomeScreenGuide() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * The way back to the guide after its first showing (D232): a row at the foot of the
 * announcements, or - on an event with no announcements - the home's banner itself. Gone once
 * the page runs from the home screen, where there is nothing left to add.
 */
export function HomeScreenRow({ variant, onOpen }: { variant: "banner" | "row"; onOpen?: () => void }) {
  const device = useDevice();
  if (device === "installed") return null;
  const open = () => { onOpen?.(); openHomeScreenGuide(); };
  return (
    <button
      type="button"
      onClick={open}
      aria-haspopup="dialog"
      className={variant === "banner"
        ? "flex w-full items-center gap-3 rounded-[12px] bg-accent px-3.5 py-3 text-left text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        : "mt-2 flex w-full items-center gap-3 rounded-[10px] border border-dashed border-primary/30 px-3 py-2.5 text-left text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"}
    >
      <Smartphone aria-hidden className="size-5 shrink-0" />
      <span className="min-w-0 flex-1 text-sm font-bold">Add this page to your home screen</span>
      <ChevronRight aria-hidden className="size-4.5 shrink-0" />
    </button>
  );
}

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
 * visit to the home page, a moment after the page settles, and never again by itself once
 * closed on that phone - a prompt that comes back every visit teaches people to swat it away
 * unread. `HomeScreenRow` opens it again on request (D232).
 *
 * The steps depend on what the phone can do:
 * - Chrome on Android fires `beforeinstallprompt`, so the popup has a real Add button.
 * - iOS never offers a prompt to a web page, so the popup walks through Safari's Share sheet.
 * - Other Android browsers - WhatsApp's in-app one above all - may offer neither, so the popup
 *   walks through Chrome's menu, starting with getting the link into Chrome.
 * Nothing opens by itself on a desktop or when the page is already running from the home
 * screen. Whenever it is open, the numbered steps show (D233), with an iPhone / Android switch.
 */
export function AddToHomeScreen({ appName }: { appName: string }) {
  const device = useDevice();
  const [canPrompt, setCanPrompt] = useState(false);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<"ios" | "android" | null>(null);
  const prompt = useRef<InstallPrompt | null>(null);
  // Which steps to show: the attendee's own pick, else the phone we detected (Android for a
  // computer - the more common phone - with the switch one tap away).
  const guide = picked ?? (device === "ios" ? "ios" : "android");

  useEffect(() => {
    if (device === "installed") return;
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      prompt.current = e as InstallPrompt;
      setCanPrompt(true);
      if (!wasDismissed()) setOpen(true);
    };
    const onInstalled = () => setOpen(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // A desktop browser with no prompt gets nothing: it is not where the day happens.
    const auto = (device === "ios" || device === "android") && !wasDismissed();
    const timer = auto ? window.setTimeout(() => setOpen(true), OPEN_AFTER_MS) : undefined;
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(OPEN_EVENT, onOpen);
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
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto">
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

        {/* Chrome's own install sheet, where it offers one: a shortcut above the steps, never
            instead of them (D233). */}
        {canPrompt && (
          <Button className="h-11 w-full text-base font-bold" onClick={install}>Add to home screen</Button>
        )}

        <div className="flex flex-col gap-3">
          {/* The steps always show, for the phone we think this is; the switch is for when we
              guessed wrong, or for reading them on a computer before picking up the phone. */}
          <div role="group" aria-label="Your phone" className="flex rounded-[10px] bg-muted p-1">
            {(["ios", "android"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={guide === k}
                onClick={() => setPicked(k)}
                className={`flex min-h-9 flex-1 items-center justify-center rounded-[7px] text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${guide === k ? "bg-card font-bold text-foreground shadow-[0_1px_2px_rgba(17,24,39,.08)]" : "font-semibold text-muted-foreground"}`}
              >
                {k === "ios" ? "iPhone" : "Android"}
              </button>
            ))}
          </div>
          {device === "other" && (
            <p className="text-center text-xs text-muted-foreground text-balance">Do this on your phone: open your event link there first.</p>
          )}
          {guide === "ios" ? (
            <ol className="flex flex-col gap-3" aria-label="How to add it on iPhone">
              <Step n={1}>Open this page in <Strong>Safari</Strong>. Came from WhatsApp? Tap <Strong>Share</Strong> or the <Strong>compass</Strong> icon, then <Strong>Open in Safari</Strong>.</Step>
              {/* iOS 26 moved Share off the toolbar into the menu beside the address bar;
                  older Safari still shows it in the bottom bar, so step 2 says both. */}
              <Step n={2}>Tap the menu button <Menu aria-hidden className={inlineIcon} /> or <Ellipsis aria-hidden className={inlineIcon} /> beside the address bar. On older iPhones, skip to the next step: the Share button is in the bar at the bottom.</Step>
              <Step n={3}>Tap <Strong>Share</Strong> <Share aria-hidden className={inlineIcon} />.</Step>
              <Step n={4}>Scroll down the list and tap <Strong>Add to Home Screen</Strong> <SquarePlus aria-hidden className={inlineIcon} />.</Step>
              <Step n={5}>Tap <Strong>Add</Strong>. The icon appears on your home screen.</Step>
            </ol>
          ) : (
            <ol className="flex flex-col gap-3" aria-label="How to add it on Android">
              <Step n={1}>Open this page in <Strong>Chrome</Strong>. Came from WhatsApp? Tap the menu <EllipsisVertical aria-hidden className={inlineIcon} />, then <Strong>Open in Chrome</Strong>.</Step>
              <Step n={2}>Tap the menu <EllipsisVertical aria-hidden className={inlineIcon} /> at the top right.</Step>
              <Step n={3}>Tap <Strong>Add to Home screen</Strong> or <Strong>Install app</Strong>.</Step>
              <Step n={4}>Tap <Strong>Add</Strong> or <Strong>Install</Strong>. The icon appears on your home screen.</Step>
            </ol>
          )}
        </div>

        <Button variant="ghost" className="-mt-2 w-full text-muted-foreground" onClick={close}>Not now</Button>
      </DialogContent>
    </Dialog>
  );
}
