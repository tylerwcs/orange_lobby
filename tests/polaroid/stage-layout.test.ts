import { describe, expect, it } from "vitest";
import { cardRatio } from "@/features/polaroid/lib/card";
import {
  ALERT_H, BAR_H, CAMERA_H, CAMERA_W, EDGE, EVENT_LINE, FOOT, PRINT_SLACK, PROMPT_H, SLOT_IN_CAMERA, UNDER_CLOSE, stageLayout,
} from "@/features/polaroid/lib/stage-layout";

const PHONES = [{ w: 390, h: 844 }, { w: 360, h: 740 }];
const RATIOS = [1.2, cardRatio(3, 4), cardRatio(9, 16), cardRatio(16, 9)];

describe("stageLayout (D482)", () => {
  it("ejects the print from the scaled camera's film slot", () => {
    for (const box of PHONES) {
      const at = stageLayout(box, false, false, 1.2);
      expect(at.slotY).toBeCloseTo(at.cameraTop + SLOT_IN_CAMERA * at.k);
    }
  });

  it("scales the camera with the phone, up to 1.2, and keeps it on screen", () => {
    expect(stageLayout({ w: 390, h: 844 }, false, false, 1.2).k).toBeCloseTo(358 / 300);
    expect(stageLayout({ w: 1024, h: 1366 }, false, false, 1.2).k).toBe(1.2);
    for (const box of PHONES) {
      const at = stageLayout(box, true, true, 1.2);
      expect(at.cameraLeft).toBeGreaterThanOrEqual(16);
      expect(at.cameraLeft + CAMERA_W * at.k).toBeLessThanOrEqual(box.w - 16);
      expect(at.cameraTop).toBeGreaterThan(at.promptTop);
      expect(at.cameraTop + CAMERA_H * at.k).toBeLessThanOrEqual(box.h);
    }
  });

  it("starts the print below the close button when there is one", () => {
    for (const box of PHONES) for (const ratio of RATIOS) {
      expect(stageLayout(box, false, true, ratio).printTop).toBeGreaterThanOrEqual(UNDER_CLOSE);
      expect(stageLayout(box, false, false, ratio).printTop).toBeGreaterThanOrEqual(EDGE);
    }
  });

  it("fits the print, the alert's room and the controls bar on 390×844 and 360×740 without overlap", () => {
    for (const box of PHONES) for (const ratio of RATIOS) for (const closable of [true, false]) {
      const at = stageLayout(box, true, closable, ratio);
      expect(at.width).toBeLessThanOrEqual(box.w - 32);
      expect(at.printTop + at.cardH + PRINT_SLACK).toBeLessThanOrEqual(box.h - BAR_H - ALERT_H);
    }
  });

  it("puts the prompt just above the camera", () => {
    for (const box of PHONES) for (const eventLine of [true, false]) for (const closable of [true, false]) {
      const at = stageLayout(box, eventLine, closable, 1.2);
      const gap = at.cameraTop - (at.promptTop + PROMPT_H);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(8);
    }
  });

  it("centres the event line, prompt and camera as one group, below the corner buttons", () => {
    for (const box of PHONES) for (const eventLine of [true, false]) for (const closable of [true, false]) {
      const at = stageLayout(box, eventLine, closable, 1.2);
      const top = closable ? UNDER_CLOSE : EDGE;
      const above = at.eventTop - top;
      const below = box.h - FOOT - (at.cameraTop + CAMERA_H * at.k);
      expect(above).toBeGreaterThan(0);
      expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
    }
  });

  it("puts the event's name above the prompt", () => {
    const at = stageLayout({ w: 390, h: 844 }, true, false, 1.2);
    expect(at.promptTop - at.eventTop).toBe(EVENT_LINE);
    expect(stageLayout({ w: 390, h: 844 }, false, false, 1.2).promptTop).toBe(stageLayout({ w: 390, h: 844 }, false, false, 1.2).eventTop);
  });

  it("never starts above the top edge on a short screen", () => {
    for (const closable of [true, false]) {
      const at = stageLayout({ w: 740, h: 360 }, true, closable, 1.2);
      expect(at.eventTop).toBe(closable ? UNDER_CLOSE : EDGE);
    }
  });
});
