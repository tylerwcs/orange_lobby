"use client";
import { CARD, messageScale } from "../lib/card";
import { MAX_MESSAGE, messageLength } from "../lib/message";

/** The message, typed straight onto the card's strip in the handwriting it will appear in (D482). */
export function MessageField({ width, ratio, value, onChange, disabled }: {
  width: number;
  ratio: number;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <textarea value={value} disabled={disabled} rows={2} aria-label="Message" placeholder="Write a message…"
      onChange={(e) => {
        const v = e.target.value.replace(/\n/g, " ");
        if (messageLength(v) <= MAX_MESSAGE) onChange(v);
      }}
      className="absolute inset-x-[6%] resize-none bg-transparent text-center leading-[1.05] text-[#2b2b2b] outline-none placeholder:text-black/25"
      style={{
        top: width * (ratio - CARD.strip) + width * 0.02,
        height: width * (CARD.strip - 0.04),
        fontFamily: "var(--font-hand)",
        fontWeight: 700,
        fontSize: width * 0.085 * messageScale(messageLength(value)),
      }} />
  );
}
