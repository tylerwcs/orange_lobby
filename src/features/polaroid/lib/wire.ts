import type { CardLook } from "./look";
import type { StickerPlacement } from "./placement";
import type { WallBackground, WallSpeed } from "./settings";

/** What `PolaroidCard` draws: the photo (null once removed), its pixel size, the message, the stickers and the tilt. */
export type CardData = { src: string | null; w: number; h: number; message: string; stickers: StickerPlacement[]; tilt: number };

export type WallCard = CardData & { id: string; created_at: string };

/** The LED's whole picture (D484). `key` changes whenever anything on it does, for "unchanged" answers. */
export type WallState = {
  now: number;
  key: string;
  cards: WallCard[];
  stickerSrc: Record<string, string>;
  columns: "auto" | number;
  speed: WallSpeed;
  background: WallBackground | null;
  brand: string | null;
  /** D718: how every card on the wall is printed. */
  look: CardLook;
  qr: string | null;
  open: boolean;
};
