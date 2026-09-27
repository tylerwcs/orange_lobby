"use client";
import { useEffect, useState } from "react";

/** The LED's mute switch (D302): top-right, shown only while the mouse moves (the cursor is otherwise hidden). */
export function MuteToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const move = () => {
      setShown(true);
      clearTimeout(t);
      t = setTimeout(() => setShown(false), 2500);
    };
    window.addEventListener("mousemove", move);
    return () => { window.removeEventListener("mousemove", move); clearTimeout(t); };
  }, []);
  return (
    <button type="button" onClick={onToggle} aria-label={muted ? "Turn the display's sound on" : "Turn the display's sound off"}
      className={`absolute right-6 top-6 z-40 cursor-pointer rounded-full bg-black/70 px-5 py-3 text-xl font-bold text-white transition-opacity ${shown ? "opacity-100" : "pointer-events-none opacity-0"}`}>
      {muted ? "🔇 Sound off" : "🔊 Sound on"}
    </button>
  );
}
