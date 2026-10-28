/** One piece of a dictionary line with **bold** and {icon} marks (D739). */
export type RichPart = { kind: "text" | "bold" | "icon"; value: string };

export function richParts(text: string): RichPart[] {
  return text.split(/(\*\*[^*]+\*\*|\{\w+\})/g).filter(Boolean).map((p): RichPart =>
    p.startsWith("**") && p.endsWith("**") ? { kind: "bold", value: p.slice(2, -2) }
      : /^\{\w+\}$/.test(p) ? { kind: "icon", value: p.slice(1, -1) }
      : { kind: "text", value: p });
}
