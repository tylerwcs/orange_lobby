export const CUSTOM_NAME_MAX = 80;
export const CUSTOM_DESCRIPTION_MAX = 2000;

type Read = { ok: true; value: { name: string; description: string | null } } | { ok: false; error: string };

/** A custom module from its add or edit form (D436). The table's checks say the same, so a refusal here never reaches the database. */
export function readCustomModule(fd: FormData): Read {
  const name = String(fd.get("name") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim();
  if (!name) return { ok: false, error: "Give the custom module a name." };
  if (name.length > CUSTOM_NAME_MAX) return { ok: false, error: "Keep the name to 80 characters." };
  if (description.length > CUSTOM_DESCRIPTION_MAX) return { ok: false, error: "Keep the description to 2,000 characters." };
  return { ok: true, value: { name, description: description || null } };
}
