"use client";
import type { ReactNode } from "react";
import { RowActions, RowMoveContext } from "@/components/admin/RowActions";

export type TestRow = {
  id: string;
  title: string;
  sub: string | null;
  /** A small picture beside the row (the question's scene, the character), or a colour swatch. */
  thumb: { src: string } | { colour: string } | null;
  /** The edit form, rendered on the server. */
  form: ReactNode;
  /** Why it can't be removed right now (D887, the test's bounds), or undefined. */
  blocked?: string;
};

/**
 * D884: the test's questions or personalities as the admin's table-style rows, each with its ⋯
 * menu: Edit, Move up / Move down (questions, until guests have results), Remove.
 */
export function TestRows({ rows, noun, move, remove }: {
  rows: TestRow[];
  noun: string;
  /** Null once the order is locked (D887). */
  move: ((id: string, dir: "up" | "down") => Promise<void>) | null;
  remove: (id: string) => Promise<void>;
}) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((r, i) => (
        <li key={r.id} className="flex items-center gap-3 py-3">
          <span className="w-6 shrink-0 text-right text-sm font-bold tabular-nums text-muted-foreground">{i + 1}</span>
          {r.thumb && ("src" in r.thumb
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={r.thumb.src} alt="" width={48} height={32} className="h-8 w-12 shrink-0 rounded object-cover" />
            : <span aria-hidden className="size-8 shrink-0 rounded-full ring-1 ring-border" style={{ background: r.thumb.colour }} />)}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{r.title}</div>
            {r.sub && <div className="truncate text-xs font-semibold text-muted-foreground">{r.sub}</div>}
          </div>
          <RowMoveContext.Provider value={move ? {
            up: i > 0 ? () => void move(r.id, "up") : null,
            down: i < rows.length - 1 ? () => void move(r.id, "down") : null,
          } : null}>
            <RowActions
              name={`${noun} ${i + 1}`}
              edit={{ title: `Edit ${noun.toLowerCase()} ${i + 1}`, form: r.form }}
              remove={{ action: () => remove(r.id), message: "This cannot be undone.", label: "Remove", blocked: r.blocked }}
            />
          </RowMoveContext.Provider>
        </li>
      ))}
    </ul>
  );
}
