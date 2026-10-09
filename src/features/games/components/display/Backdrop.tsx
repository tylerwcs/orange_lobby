"use client";
import { CHROMA_GREEN, type Background } from "../../background";

/**
 * What sits behind the 3D layer (D297–D300): nothing for Theme (the 3D layer paints it), solid
 * chroma green with nothing on it, or the uploaded image or muted looping video under a 35% black
 * veil. A file that fails to load calls `onFail`, and the LED falls back to Theme.
 */
export function Backdrop({ look, onFail }: { look: Background; onFail: () => void }) {
  if (look.kind === "green") return <div className="absolute inset-0" style={{ background: CHROMA_GREEN }} />;
  if ((look.kind === "image" || look.kind === "video") && look.url) {
    return (
      <div className="absolute inset-0">
        {look.kind === "image"
          // eslint-disable-next-line @next/next/no-img-element -- an organiser upload; next/image adds nothing on a 1080p canvas
          ? <img src={look.url} alt="" className="size-full object-cover" onError={onFail} />
          : <video src={look.url} className="size-full object-cover" autoPlay muted loop playsInline onError={onFail} />}
        <div className="absolute inset-0 bg-black/35" />
      </div>
    );
  }
  return null;
}
