"use client";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/admin/CopyButton";
import { cleanSource, trackedLink } from "../client";

/** D899: type who the link is for, get the registration link with their tag on it. Nothing is saved: a tag appears in the table once someone uses it. */
export function LinkBuilder({ url }: { url: string }) {
  const id = useId();
  const [raw, setRaw] = useState("");
  const tag = cleanSource(raw);
  const link = tag ? trackedLink(url, tag) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>Who is the link for?</Label>
        <Input id={id} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="e.g. obesity-site-popup" autoComplete="off" spellCheck={false} />
        <p className="text-xs text-muted-foreground">
          Becomes the link&rsquo;s tag: lower case letters, numbers, dots and dashes. Use one tag per place the link goes, so each has its own count.
        </p>
      </div>
      {link && (
        <div className="flex items-center gap-2">
          <a href={link} target="_blank" rel="noreferrer" className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 font-mono text-xs text-primary">{link}</a>
          <CopyButton value={link} label="tracked link" />
        </div>
      )}
    </div>
  );
}
