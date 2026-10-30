"use client";
import { useEffect, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shares the result line (D774). The phone's share sheet when there is one, otherwise the text
 * is copied and the button says "Copied". The text is built by `shareText` from the event's
 * generic link, so it never carries the player's token.
 */
export function ShareButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const share = async () => {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // A dismissed share sheet (AbortError) or a refused clipboard: nothing to report.
      setCopied(false);
    }
  };

  return (
    <Button type="button" variant="secondary" className="h-11 w-full" onClick={() => void share()}>
      {copied ? <Check data-icon="inline-start" /> : <Share2 data-icon="inline-start" />}
      <span aria-live="polite">{copied ? "Copied" : "Share"}</span>
    </Button>
  );
}
