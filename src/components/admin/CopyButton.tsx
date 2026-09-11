"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * Copies a share link. The link stays a selectable anchor beside it, so a browser
 * that refuses clipboard access (or an insecure origin) costs convenience, not the
 * ability to get the URL.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button type="button" aria-label={`Copy the ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] bg-canvas px-3.5 text-xs font-bold text-ink transition-colors duration-150 hover:brightness-95">
      <Icon name={copied ? "check" : "link"} size={15} />
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
