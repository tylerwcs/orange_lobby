"use client";
import { motion } from "motion/react";

/**
 * The LED's standard layout: a title on the left, one big fact on the right (a count, or a timer
 * ring), the screen's content below. The fact may be a clock, so it may differ at hydration.
 */
export function Frame({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col px-16 pb-12 pt-10">
      <header className="flex min-h-[150px] items-center justify-between gap-8">
        <motion.h1 initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
          className="truncate font-game text-6xl drop-shadow-[0_4px_16px_rgba(0,0,0,0.45)]">{title}</motion.h1>
        {right !== undefined && right !== null && (
          <div className="shrink-0 font-game text-6xl tabular-nums text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.45)]" suppressHydrationWarning>{right}</div>
        )}
      </header>
      <div className="min-h-0 flex-1 pt-4">{children}</div>
    </div>
  );
}
