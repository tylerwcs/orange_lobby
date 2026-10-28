import { describe, it, expect } from "vitest";
import { resolveLang } from "@/features/language/lang";
import { en } from "@/features/language/en";
import { ms } from "@/features/language/ms";

describe("resolveLang", () => {
  it("is Malay only when the event's switch is on and the cookie says ms", () => {
    expect(resolveLang(true, "ms")).toBe("ms");
    expect(resolveLang(true, "en")).toBe("en");
  });
  it("is English when the switch is off, whatever the cookie says", () => {
    expect(resolveLang(false, "ms")).toBe("en");
    expect(resolveLang(false, undefined)).toBe("en");
  });
  it("is English for a missing or unknown cookie", () => {
    for (const c of [undefined, "", "MS", "fr", " ms"]) expect(resolveLang(true, c)).toBe("en");
  });
});

type Node = unknown;
const leaves = (o: Node, path: string[] = []): [string, Node][] =>
  o && typeof o === "object"
    ? Object.entries(o as Record<string, Node>).flatMap(([k, v]) => leaves(v, [...path, k]))
    : [[path.join("."), o]];
const at = (o: Node, path: string) => path.split(".").reduce<Node>((n, k) => (n as Record<string, Node>)?.[k], o);

/**
 * Sample arguments for function entries whose arguments are not all strings. Keyed by path;
 * every other function gets distinct marker strings, so a Malay sentence that drops or
 * rewrites an organiser-typed name fails.
 */
const SAMPLES: Record<string, unknown[]> = {
  "home.slide": [7, 13],
  "home.showSlide": [7, 13],
  "cards.seatsLeft": ["«R»", 7],
};
const argsFor = (path: string, arity: number) => SAMPLES[path] ?? Array.from({ length: arity }, (_, i) => `«X${i}»`);

describe("dictionaries", () => {
  const enLeaves = leaves(en);
  const msLeaves = leaves(ms);

  it("have exactly the same keys", () => {
    expect(msLeaves.map(([p]) => p).sort()).toEqual(enLeaves.map(([p]) => p).sort());
  });
  it("have the same kind of value, and functions take the same number of arguments", () => {
    for (const [path, v] of enLeaves) {
      const m = at(ms, path);
      expect(typeof m, path).toBe(typeof v);
      if (typeof v === "function") expect((m as (...a: unknown[]) => string).length, path).toBe((v as (...a: unknown[]) => string).length);
    }
  });
  it("keep every argument in the Malay sentence", () => {
    for (const [path, v] of enLeaves) {
      if (typeof v !== "function") continue;
      const args = argsFor(path, v.length);
      const out = (at(ms, path) as (...a: unknown[]) => string)(...args);
      for (const a of args) {
        if (typeof a === "string" || typeof a === "number") expect(out, path).toContain(String(a));
      }
    }
  });
  it("keep every icon and bold marker in rich lines", () => {
    const marks = (s: string) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();
    for (const [path, v] of enLeaves) {
      if (typeof v !== "string") continue;
      const m = at(ms, path) as string;
      expect(marks(m), path).toEqual(marks(v));
      expect((m.match(/\*\*/g) ?? []).length % 2, path).toBe(0);
    }
  });
  it("have no empty Malay wording", () => {
    for (const [path, v] of msLeaves) if (typeof v === "string") expect(v.trim(), path).not.toBe("");
  });
});
