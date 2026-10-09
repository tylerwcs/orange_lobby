/** A posted form, as the settings readers read it (D420). */
export type FormReader = {
  /** The field's text, trimmed; empty when absent. */
  text(key: string): string;
  /** Whether a checkbox was ticked: a checkbox posts nothing at all when it is not. */
  checked(key: string): boolean;
  /** Every value posted under the key, for pickers that post one value each. */
  all(key: string): string[];
  /** The field's raw string, or null when absent - the shape the shared readers in src/lib take. */
  get(key: string): string | null;
};

export function formReader(fd: FormData): FormReader {
  const get = (key: string) => {
    const v = fd.get(key);
    return typeof v === "string" ? v : null;
  };
  return {
    text: (key) => (get(key) ?? "").trim(),
    checked: (key) => fd.get(key) !== null,
    all: (key) => fd.getAll(key).map(String),
    get,
  };
}

/**
 * The ticked categories from the "Who can see it" picker (CategoryCombo), which posts one
 * `categories` value each, joined with commas for `parseCategories`; no category name contains
 * one (categoryParts splits on it).
 */
export function categoryValues(form: FormReader): string {
  return form.all("categories").join(",");
}
