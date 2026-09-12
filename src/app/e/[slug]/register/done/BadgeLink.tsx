"use client";
import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

/**
 * The personal link, in the one shape a phone can actually act on. Reading a 60-character
 * URL off a screen is not a plan, and "bookmark this page" is an instruction most people
 * cannot follow on their own phone — so the link is selectable text with a copy button on
 * it, and the clipboard failing (an insecure origin, a locked-down browser) leaves the
 * text exactly where it was.
 */
export function BadgeLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <InputGroup className="h-11">
      <label htmlFor="badge-link" className="sr-only">Your personal event link</label>
      <InputGroupInput id="badge-link" readOnly value={link} className="h-11 text-xs" onFocus={(e) => e.currentTarget.select()} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-sm" aria-label="Copy my link" onClick={async () => {
          try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
        }}>
          {copied ? <Check /> : <Copy />}
        </InputGroupButton>
      </InputGroupAddon>
      <span aria-live="polite" className="sr-only">{copied ? "Link copied" : ""}</span>
    </InputGroup>
  );
}
