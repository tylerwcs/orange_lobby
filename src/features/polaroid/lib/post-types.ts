/** What the composer sends once its photo is in the bucket (D478). */
export type PostInput = { path: string; width: number; height: number; message: string; stickers: unknown };
/** A refusal the composer shows as it is; `wait` is seconds, for the countdown on the button. */
export type Refusal = { ok: false; error: string; wait?: number };
export type StartResult = { ok: true; path: string; token: string } | Refusal;
export type PostResult = { ok: true; id: string } | Refusal;
export type RemoveResult = { ok: true } | { ok: false; error: string };
