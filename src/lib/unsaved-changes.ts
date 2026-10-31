/** "A", "A and B", "A, B and C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * D778: which dirty tab forms a submit would drop. Any form on the page counts, a tab's own or not (the Me page form,
 * a dialog, a What's on switch); a tab form never counts its own changes, because that save writes them.
 */
export function formsLost<T>(submitted: T, dirtyTabForms: readonly T[]): T[] {
  return dirtyTabForms.filter((f) => f !== submitted);
}

/** D778: what UnsavedGuard asks before one Settings tab's save drops the others' edits. */
export function unsavedChangesMessage(tabs: readonly string[]): string {
  return `You have unsaved changes on ${joinNames(tabs)}. Save anyway and lose them?`;
}
