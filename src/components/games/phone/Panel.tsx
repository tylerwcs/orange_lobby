"use client";
import { motion } from "motion/react";

const TONES = {
  brand: "bg-primary text-primary-foreground",
  go: "bg-emerald-500 text-white",
  out: "bg-rose-600 text-white",
  win: "bg-amber-400 text-amber-950",
  calm: "bg-muted text-foreground",
} as const;
export type Tone = keyof typeof TONES;

/** One full-screen moment on the play page (D307): a colour, an icon, a big line, a small line. */
export function Panel({ tone, icon, title, children, pulse = false }: { tone: Tone; icon?: string; title: React.ReactNode; children?: React.ReactNode; pulse?: boolean }) {
  return (
    <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className={`flex min-h-[62dvh] w-full flex-col items-center justify-center gap-4 rounded-3xl p-6 text-center ${TONES[tone]}`}>
      {icon && (
        <motion.span aria-hidden className="text-7xl"
          animate={pulse ? { scale: [1, 1.12, 1] } : undefined} transition={pulse ? { repeat: Infinity, duration: 1.6 } : undefined}>{icon}</motion.span>
      )}
      <div className="font-game text-4xl leading-tight">{title}</div>
      {children && <div className="max-w-sm text-base opacity-90">{children}</div>}
    </motion.div>
  );
}
