export function Field({ label, name, type = "text", defaultValue, placeholder, textarea }: {
  label: string; name: string; type?: string; defaultValue?: string | null; placeholder?: string; textarea?: boolean;
}) {
  const cls = "w-full min-h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-sm";
  const textareaCls = "w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-sm";
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-sm font-bold">{label}</span>
      {textarea
        ? <textarea name={name} defaultValue={defaultValue ?? ""} placeholder={placeholder} rows={4} className={textareaCls} />
        : <input name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} className={cls} />}
    </label>
  );
}
