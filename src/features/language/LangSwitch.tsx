"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLang, useT } from "./client";
import { setLangAction } from "./actions";
import type { Lang } from "./lang";

const OPTIONS: { lang: Lang; label: string; full: "english" | "malay" }[] = [
  { lang: "en", label: "EN", full: "english" },
  { lang: "ms", label: "BM", full: "malay" },
];

/**
 * The portal's EN | BM switch (D739), shown only on an event that offers it. The choice is a
 * cookie on this device; the page re-renders in place on the server, so the address the
 * attendee was sent never changes.
 */
export function LangSwitch({ className = "" }: { className?: string }) {
  const lang = useLang();
  const d = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (next: Lang) => {
    if (next === lang) return;
    start(async () => {
      await setLangAction(next);
      router.refresh();
    });
  };
  return (
    <div role="group" aria-label={d.common.languageLabel} aria-busy={pending}
      className={`relative z-10 flex shrink-0 rounded-full bg-muted p-0.5 transition-opacity ${pending ? "opacity-60" : ""} ${className}`}>
      {OPTIONS.map((o) => (
        <button
          key={o.lang}
          type="button"
          lang={o.lang}
          aria-pressed={lang === o.lang}
          aria-label={d.common[o.full]}
          onClick={() => pick(o.lang)}
          className={`flex min-h-10 min-w-11 items-center justify-center rounded-full px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${lang === o.lang ? "bg-card font-extrabold text-foreground shadow-[0_1px_2px_rgba(17,24,39,.08)]" : "font-semibold text-muted-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
