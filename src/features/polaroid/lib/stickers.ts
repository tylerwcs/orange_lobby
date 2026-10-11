import type { PolaroidSettings } from "./settings";

/** One sticker the tray offers or a card draws. `src` is an image URL. */
export type StickerDef = { id: string; name: string; src: string };

const BUILTIN: readonly (readonly [string, string])[] = [
  ["heart", "Heart"], ["hearts", "Hearts"], ["star", "Star"], ["sparkles", "Sparkles"],
  ["smiley", "Smiley"], ["wink", "Wink"], ["sun", "Sun"], ["flower", "Flower"],
  ["crown", "Crown"], ["balloon", "Balloon"], ["party-hat", "Party hat"], ["confetti", "Confetti"],
  ["music", "Music"], ["rainbow", "Rainbow"], ["bolt", "Bolt"], ["wow", "WOW"], ["yay", "YAY"], ["love", "LOVE"],
];

/** D483: the pack every event has. Original artwork, in public/polaroid-stickers. */
export const BUILTIN_STICKERS: readonly StickerDef[] = BUILTIN.map(([id, name]) => ({ id, name, src: `/polaroid-stickers/${id}.svg` }));

/** The tray (D482): the event's own stickers first, then the built-ins the admin has not hidden. */
export function stickerTray(settings: Pick<PolaroidSettings, "stickers" | "hidden_builtin">): StickerDef[] {
  const hidden = new Set(settings.hidden_builtin);
  return [
    ...settings.stickers.map((s) => ({ id: s.id, name: s.name, src: s.url })),
    ...BUILTIN_STICKERS.filter((s) => !hidden.has(s.id)),
  ];
}

/**
 * Every sticker a stored polaroid may name, for drawing (D476). Hidden built-ins still draw on
 * cards made before they were hidden; an event sticker deleted since is simply absent, and the
 * card skips it rather than breaking.
 */
export function stickerSources(settings: Pick<PolaroidSettings, "stickers">): Record<string, string> {
  return Object.fromEntries([
    ...BUILTIN_STICKERS.map((s) => [s.id, s.src] as const),
    ...settings.stickers.map((s) => [s.id, s.url] as const),
  ]);
}

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
export function newEventStickerId(rand: () => number = Math.random): string {
  let id = "ev-";
  for (let i = 0; i < 8; i++) id += ID_CHARS[Math.floor(rand() * ID_CHARS.length)];
  return id;
}
