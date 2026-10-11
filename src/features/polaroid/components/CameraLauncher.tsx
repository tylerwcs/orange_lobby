"use client";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StickerDef } from "../lib/stickers";
import type { PostInput, PostResult, StartResult } from "../lib/post-types";
import { PolaroidComposer } from "./PolaroidComposer";

const noSubscribe = () => () => {};

/**
 * The portal's way into the camera (D482): one big button that opens the full-screen composer
 * over everything, drawn into `document.body` so the portal's chrome can't clip it. After a post
 * the camera stays open for another shot; closing it returns to the page, where "Your polaroids"
 * already shows the post. `openOnArrival` is the card's `?camera=1`, dropped from the address on
 * close so a refresh doesn't reopen it.
 */
export function CameraLauncher({ openOnArrival = false, ...composer }: {
  prompt: string;
  stickers: StickerDef[];
  start: () => Promise<StartResult>;
  post: (input: PostInput) => Promise<PostResult>;
  brand?: string | null;
  openOnArrival?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(openOnArrival);
  // The portal needs `document`, so the stage is drawn only once in the browser.
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);

  const close = () => {
    setOpen(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has("camera")) {
      url.searchParams.delete("camera");
      router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
    }
  };

  return (
    <>
      <Button type="button" size="lg" className="h-12 w-full gap-2 text-base font-bold" onClick={() => setOpen(true)}>
        <Camera aria-hidden className="size-5" />Open camera
      </Button>
      {open && inBrowser && createPortal(<PolaroidComposer {...composer} onClose={close} />, document.body)}
    </>
  );
}
