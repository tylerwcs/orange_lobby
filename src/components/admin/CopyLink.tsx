"use client";
import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Puts an attendee's personal link on the clipboard, to paste into WhatsApp or a mail
 * merge. This is what stands in for sending the badge: the app has no mail provider, so
 * a "Resend" button would be a button that cannot do what it says.
 */
export function CopyLink({ link, label = "Copy link" }: { link: string; label?: string }) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 2000);
    return () => clearTimeout(t);
  }, [done]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setDone(true);
    } catch {
      // Clipboard access can be refused (an insecure origin, a locked-down browser).
      // Selecting the link is then the honest fallback, so say so rather than failing mutely.
      window.prompt("Copy this link:", link);
    }
  };

  return (
    <Button type="button" onClick={copy}>
      {done ? <Check data-icon="inline-start" /> : <Link2 data-icon="inline-start" />}
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </Button>
  );
}
