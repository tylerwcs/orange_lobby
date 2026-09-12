"use client";
import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Copies a share link. The link stays a selectable anchor beside it, so a browser that
 * refuses clipboard access (or an insecure origin) costs convenience, not the ability to
 * get the URL.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <Button
      type="button" variant="secondary" size="sm" aria-label={`Copy the ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check data-icon="inline-start" /> : <Link2 data-icon="inline-start" />}
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </Button>
  );
}
