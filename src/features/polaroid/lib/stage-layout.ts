import { stageCardWidth } from "./card";

/** Camera's own fixed design (unscaled), and its film slot within it (D482). */
export const CAMERA_W = 300;
export const CAMERA_H = 340;
export const SLOT_IN_CAMERA = 300;
export const MAX_CAMERA_SCALE = 1.2;
/** The stage's vertical rhythm, in px inside the safe area. */
export const EDGE = 16;
export const EVENT_LINE = 24;
export const PROMPT_H = 72;
/** Under the camera: room for a refusal before a photo is taken. */
export const FOOT = 56;
/** The shutter bar pinned to the bottom (72 px shutter + its handwritten label), and room for an error above it. */
export const BAR_H = 124;
export const ALERT_H = 48;
/** The print's wrapper reaches past the card itself. */
export const PRINT_SLACK = 24;
/** The print starts below the close button, where there is one. */
export const UNDER_CLOSE = 56;
/** What the stage is laid out for before it has measured itself, so the server already draws it. */
export const DEFAULT_STAGE = { w: 390, h: 740 } as const;

export type StageBox = { w: number; h: number };
export type StageLayout = ReturnType<typeof stageLayout>;

/**
 * Where everything sits on a stage `box` wide and tall (D482): the prompt at the top, the camera
 * scaled with the phone and centred in the space below it, and the print being edited as large as
 * fits above the controls bar (and below the close button). The print ejects from the scaled
 * camera's film slot.
 */
export function stageLayout(box: StageBox, eventLine: boolean, closable: boolean, ratio: number) {
  const promptTop = EDGE + (eventLine ? EVENT_LINE : 0);
  const below = promptTop + PROMPT_H + 8;
  const room = box.h - below - FOOT;
  const k = Math.max(0.5, Math.min(MAX_CAMERA_SCALE, (box.w - 32) / CAMERA_W, room / CAMERA_H));
  const cameraTop = below + Math.max(0, (room - CAMERA_H * k) / 2);
  const top = closable ? UNDER_CLOSE : EDGE;
  // On a very short screen (a phone on its side) the 200 px floor can push the print into the bar.
  const width = stageCardWidth(box.w, box.h, ratio, top + PRINT_SLACK + ALERT_H + BAR_H);
  const cardH = width * ratio;
  const printTop = Math.max(top, (box.h - BAR_H - ALERT_H - cardH - PRINT_SLACK) / 2);
  return {
    promptTop, k, cameraTop, cameraLeft: (box.w - CAMERA_W * k) / 2, slotY: cameraTop + SLOT_IN_CAMERA * k,
    width, cardH, printTop,
  };
}
