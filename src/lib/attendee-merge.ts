export function mergeExtra(existing: Record<string, string>, incoming?: Record<string, string>): Record<string, string> {
  return { ...existing, ...(incoming ?? {}) };
}
