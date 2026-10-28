import type { Dict } from "./en";

/** Every path in the dictionary that leads to a plain string, e.g. "submission.save". */
export type SayKey<T = Dict, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}`
    : T[K] extends readonly unknown[] | ((...a: never[]) => unknown) ? never
    : SayKey<T[K], `${P}${K}.`>;
}[keyof T & string];

/** One plain wording by its path (D741), for `Say` and anything else that holds a key, not a language. */
export function say(d: Dict, key: SayKey): string {
  return key.split(".").reduce<unknown>((n, k) => (n as Record<string, unknown>)[k], d) as string;
}
