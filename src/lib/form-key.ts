/**
 * A React key for a form, made from the saved values it was opened with.
 *
 * The admin's forms are uncontrolled: each field starts from `defaultValue` and the browser
 * holds what is typed. After a save the page re-renders with the new values while the form is
 * still on screen, and Base UI warns (rightly) that an uncontrolled field's default changed
 * underneath it. Keying the form on its own saved values remounts it exactly when those change
 * — after its own save — and never when something else on the page does (a status click, a
 * reorder), which would throw away what the organiser has typed but not yet saved.
 */
export function formKey(values: unknown): string {
  const text = JSON.stringify(values) ?? "";
  // djb2: short, stable, and plenty to tell two versions of one form apart.
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}
