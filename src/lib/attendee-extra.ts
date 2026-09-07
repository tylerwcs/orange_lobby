export type ExtraParse = { ok: true; extra: Record<string, string> } | { ok: false; error: string };

/**
 * Parses the free-form "extra" JSON textarea used by the attendee admin forms.
 * Never throws; every input maps to an ExtraParse result.
 */
export function parseExtraJson(raw: string | null | undefined): ExtraParse {
  if (raw == null || raw.trim() === "") return { ok: true, extra: {} };

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Extra is not valid JSON" };
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "Extra must be a JSON object" };
  }

  const extra: Record<string, string> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v !== "string" && typeof v !== "number") {
      return { ok: false, error: "Extra must be a JSON object" };
    }
    extra[key] = String(v);
  }
  return { ok: true, extra };
}
