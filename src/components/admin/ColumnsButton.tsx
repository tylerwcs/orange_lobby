"use client";
import { ChevronDown, Columns3 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { ColumnDef, ColumnSource } from "@/lib/columns";

const GROUP_LABEL: Record<ColumnSource, string> = {
  builtin: "Attendee",
  registration: "From registration",
  custom: "Your columns",
  breakout: "Breakout rounds",
};

const ORDER: ColumnSource[] = ["builtin", "breakout", "registration", "custom"];

/**
 * Which columns the table shows. This is the answer to an event whose registration form
 * asks seven questions: every answer is a column, which is fifteen of them for the KOM,
 * and nobody reads fifteen columns at once. They stay one tick away, and the attendee
 * panel shows all of them for one person regardless.
 */
export function ColumnsButton({ columns, hidden, onToggle, onShowAll, onAddColumn }: {
  columns: ColumnDef[];
  hidden: Set<string>;
  onToggle: (key: string, visible: boolean) => void;
  onShowAll: () => void;
  onAddColumn: () => void;
}) {
  const hiddenCount = columns.filter((c) => hidden.has(c.key)).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="gap-1.5" />}>
        <Columns3 data-icon="inline-start" />
        Columns
        {hiddenCount > 0 && <span className="text-muted-foreground">· {hiddenCount} hidden</span>}
        <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="max-h-[70vh] w-64 overflow-y-auto">
        {ORDER.map((source) => {
          const group = columns.filter((c) => c.source === source);
          if (group.length === 0) return null;
          return (
            <DropdownMenuGroup key={source}>
              <DropdownMenuLabel className="text-muted-foreground">
                {GROUP_LABEL[source]}
                {source === "registration" && ` · ${group.length}`}
              </DropdownMenuLabel>
              {group.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={!hidden.has(c.key)}
                  onCheckedChange={(checked) => onToggle(c.key, checked)}
                  /* Keeps the menu open: hiding four columns should be four ticks, not four
                     round trips through the trigger. */
                  closeOnClick={false}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
            </DropdownMenuGroup>
          );
        })}

        <DropdownMenuGroup>
          {hiddenCount > 0 && <DropdownMenuItem onClick={onShowAll}>Show all columns</DropdownMenuItem>}
          <DropdownMenuItem onClick={onAddColumn}>Add a column…</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
