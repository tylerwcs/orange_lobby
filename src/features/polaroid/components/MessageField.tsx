"use client";
import { CARD, messageScale } from "../lib/card";
import { MAX_MESSAGE, messageLength } from "../lib/message";

const PLACEHOLDER = "Write a message…";

/**
 * The message, typed straight onto the card's strip in the handwriting it will appear in (D482).
 * It is laid out exactly as `PolaroidCard` draws the posted message (D472): the same strip box,
 * inset, font, size and line height, centred vertically. A hidden mirror gives the textarea the
 * height of its text (one line, growing to two), so the centring is the card's own flex centring.
 */
export function MessageField({ width, ratio, value, onChange, disabled }: {
  width: number;
  ratio: number;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const text = {
    fontFamily: "var(--font-hand)",
    fontWeight: 700,
    fontSize: width * 0.085 * messageScale(messageLength(value)),
  } as const;
  const shared = "col-start-1 row-start-1 w-full whitespace-pre-wrap text-center leading-[1.05] [overflow-wrap:anywhere]";
  return (
    <div className="absolute inset-x-0 flex items-center justify-center px-[6%]"
      style={{ top: width * (ratio - CARD.strip), height: width * CARD.strip }}>
      <div className="grid w-full">
        <div aria-hidden className={`${shared} invisible`} style={text}>{value ? `${value} ` : PLACEHOLDER}</div>
        <textarea value={value} disabled={disabled} rows={1} aria-label="Message" placeholder={PLACEHOLDER}
          onChange={(e) => {
            const v = e.target.value.replace(/\n/g, " ");
            // A long paste keeps its first 80 characters rather than being dropped.
            onChange(messageLength(v) <= MAX_MESSAGE ? v : [...v].slice(0, MAX_MESSAGE).join(""));
          }}
          className={`${shared} m-0 resize-none overflow-hidden border-0 bg-transparent p-0 text-[#2b2b2b] outline-none placeholder:text-black/25`}
          style={text} />
      </div>
    </div>
  );
}
