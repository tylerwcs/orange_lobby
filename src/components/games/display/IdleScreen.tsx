"use client";
import { motion } from "motion/react";
import { APP_NAME } from "@/lib/app-name";
import type { DisplayState } from "@/lib/games/wire";

/** Nothing on stage (D285, D298): the event's logo and name over the Theme background, and a nudge to have phones ready. */
export function IdleScreen({ event }: { event: DisplayState["event"] }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-10">
      {event.logoUrl && (
        <motion.img src={event.logoUrl} alt="" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="max-h-[260px] max-w-[900px] object-contain drop-shadow-[0_10px_40px_rgba(0,0,0,0.5)]" />
      )}
      <h1 className="max-w-[1700px] text-center font-game text-[110px] leading-none drop-shadow-[0_8px_30px_rgba(0,0,0,0.5)]">{event.name}</h1>
      <motion.p animate={{ opacity: [0.55, 1, 0.55] }} transition={{ repeat: Infinity, duration: 2.4 }} className="font-game text-5xl">Get ready…</motion.p>
      <p className="text-3xl opacity-70">Open {APP_NAME} on your phone to play</p>
    </div>
  );
}
