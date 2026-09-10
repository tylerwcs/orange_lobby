import { Icon } from "./Icon";

/** A read-only toolbar control face. Wrap it in a `<label>` + `<select>` where it must actually filter. */
export function SelectChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] bg-surface px-3.5 text-sm font-bold text-ink shadow-[inset_0_0_0_1px_var(--line)]">
      {label}: {value}
      <Icon name="chevron" size={14} className="rotate-90 text-muted" />
    </span>
  );
}
