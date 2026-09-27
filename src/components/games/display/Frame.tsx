"use client";

/**
 * The LED's standard layout: a plain padded box for the screen's content (D323 — no corner text
 * on any screen anymore). `relative`, so a screen can still position its own graphic — the
 * TimerRing is the one corner element left (Requirement 1) — with `absolute` inside it.
 */
export function Frame({ children }: { children: React.ReactNode }) {
  return <div className="relative flex h-full flex-col px-16 pb-12 pt-10">{children}</div>;
}
