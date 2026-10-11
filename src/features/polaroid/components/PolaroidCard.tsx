import type { CSSProperties, ReactNode } from "react";
import { handFont } from "../font";
import { CARD, PHOTO_INNER, cardRatio, messageScale, photoBoxRatio } from "../lib/card";
import type { CardData } from "../lib/wire";
import styles from "../polaroid.module.css";

/**
 * One polaroid, drawn from its parts (D472) at any width. The composer, the LED and admin all draw
 * this, so what someone composes is exactly what the wall shows. Every length is a fraction of
 * `width` (D483); stickers whose id is not in `stickerSrc` are skipped (D476).
 */
export function PolaroidCard({ card, width, stickerSrc, developing = false, hideMessage = false, loading = "eager", className = "", style, children }: {
  card: CardData;
  width: number;
  stickerSrc: Record<string, string>;
  developing?: boolean;
  hideMessage?: boolean;
  /** `lazy` for long lists (the moderation feed, "Your polaroids"); the LED and composer draw at once. */
  loading?: "lazy" | "eager";
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const w = width;
  const border = CARD.border * w;
  const photoH = PHOTO_INNER * w * photoBoxRatio(card.w, card.h);
  const base = w * 0.085;
  return (
    <div className={`${handFont.variable} relative select-none ${className}`}
      style={{ width: w, height: w * cardRatio(card.w, card.h), transform: `rotate(${card.tilt}deg)`, ...style }}>
      <div className="absolute inset-0 bg-[#fdfbf6]" style={{ borderRadius: w * 0.012, boxShadow: `0 ${w * 0.02}px ${w * 0.06}px rgb(0 0 0 / 0.35)` }} />
      <div aria-hidden className="absolute left-1/2 -translate-x-1/2 -rotate-3"
        style={{
          top: -w * 0.03, width: w * 0.26, height: w * 0.075, borderRadius: w * 0.006,
          backgroundColor: "rgba(216, 207, 191, 0.7)",
          backgroundImage: "linear-gradient(105deg, rgba(255,255,255,0.25), rgba(255,255,255,0) 45%, rgba(0,0,0,0.06))",
        }} />
      <div className="absolute overflow-hidden bg-[#ece6da]" style={{ left: border, top: border, width: PHOTO_INNER * w, height: photoH }}>
        {card.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.src} alt="" draggable={false} decoding="async" loading={loading} className={`size-full object-contain ${developing ? styles.develop : styles.film}`} />
        ) : (
          <div className="flex size-full items-center justify-center text-black/40" style={{ fontSize: base * 0.6 }}>Removed</div>
        )}
      </div>
      {!hideMessage && card.message && (
        <p className="absolute inset-x-0 flex items-center justify-center overflow-hidden px-[6%] text-center leading-[1.05] text-[#2b2b2b] [overflow-wrap:anywhere]"
          style={{ top: border + photoH, height: CARD.strip * w, fontFamily: "var(--font-hand)", fontWeight: 700, fontSize: base * messageScale([...card.message].length) }}>
          {card.message}
        </p>
      )}
      {card.stickers.map((s, i) => {
        const src = stickerSrc[s.id];
        if (!src) return null;
        const size = s.scale * w;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${s.id}-${i}`} src={src} alt="" draggable={false} className={`pointer-events-none absolute object-contain ${styles.sticker}`}
            style={{ left: s.x * w - size / 2, top: s.y * w - size / 2, width: size, height: size, transform: `rotate(${s.rot}deg)` }} />
        );
      })}
      {children}
    </div>
  );
}
