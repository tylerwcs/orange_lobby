"use client";
import { useId } from "react";
import { AgendaList } from "@/components/portal/AgendaList";
import { previewAgenda, type AgendaAnswers } from "../sections/agenda";
import { PhoneFrame } from "./PhoneFrame";

/** A spot in the agenda preview: a day's tab, or one session's row. */
export type AgendaSlot = `day:${string}` | `session:${string}`;

/** No session is ever "now" in a preview. */
const NEVER = { date: "", time: "" };

/**
 * The portal's agenda screen drawn from the organiser's draft (D445): the real AgendaList, so it
 * can't drift from what attendees see. It shows the day being edited. The session being edited
 * is outlined; clicking a row or a day tab asks for its field instead of following the link.
 */
export function AgendaPreview({ agenda, primaryColor, focused = null, onSlot, compact = false }: {
  agenda: AgendaAnswers;
  primaryColor: string;
  focused?: AgendaSlot | null;
  onSlot?: (slot: AgendaSlot) => void;
  compact?: boolean;
}) {
  const scope = useId();
  const { days, items } = previewAgenda(agenda);
  const session = focused?.startsWith("session:") ? focused.slice("session:".length) : null;
  const dayId = focused?.startsWith("day:") ? focused.slice("day:".length) : items.find((i) => i.id === session)?.day_id ?? null;
  const day = days.find((d) => d.id === dayId) ?? days[0] ?? null;

  // Captured before any link or button inside sees the click: the preview never navigates.
  const onClickCapture = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onSlot) return;
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>("[data-item-id]");
    if (row?.dataset.itemId) { onSlot(`session:${row.dataset.itemId}`); return; }
    const href = target.closest("a")?.getAttribute("href") ?? "";
    const date = new URLSearchParams(href.split("?")[1] ?? "").get("day");
    const picked = days.find((d) => d.date === date);
    if (picked) onSlot(`day:${picked.id}`);
  };

  // Setup ids hold no quotes or backslashes (the ID rule in sections/agenda.ts), so they are safe in a quoted selector.
  const outline = session
    ? `[data-preview="${scope}"] [data-item-id="${session}"]{outline:2px solid var(--primary);outline-offset:-2px}` +
      `[data-preview="${scope}"] [data-item-id="${session}"]::after{content:"Editing";position:absolute;top:4px;right:4px;` +
      "padding:1px 6px;border-radius:4px;background:var(--primary);color:var(--primary-foreground);font-size:10px;font-weight:700}"
    : "";

  return (
    <PhoneFrame primaryColor={primaryColor} label="Preview of your agenda" compact={compact}>
      {outline && <style>{outline}</style>}
      <div data-preview={scope} className={`p-4 ${onSlot ? "cursor-pointer" : ""}`} onClickCapture={onClickCapture}>
        <h1 className="mb-3 text-xl font-extrabold">Agenda</h1>
        {day ? (
          <AgendaList items={items} day={day.date} days={days.map((d) => ({ date: d.date, name: d.name }))} basePath="" now={NEVER} />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-orange-400 bg-orange-50 p-6 text-center text-[11px] font-extrabold text-orange-800">
            Your agenda<span className="font-semibold">Add a day to start</span>
          </div>
        )}
      </div>
    </PhoneFrame>
  );
}
