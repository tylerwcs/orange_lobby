export function Field({ label, name, type = "text", defaultValue, placeholder, textarea }: {
  label: string; name: string; type?: string; defaultValue?: string | null; placeholder?: string; textarea?: boolean;
}) {
  const cls = "w-full rounded border p-2 text-sm";
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {textarea
        ? <textarea name={name} defaultValue={defaultValue ?? ""} placeholder={placeholder} rows={4} className={cls} />
        : <input name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} className={cls} />}
    </label>
  );
}
