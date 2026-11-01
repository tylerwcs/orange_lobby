import { afterEach, describe, expect, it, vi } from "vitest";
import { newGame, type GameEvent } from "@/features/qualifier/game/engine";
import { drainEvents, safely } from "@/features/qualifier/components/game/sceneEvents";

const withEvents = (events: GameEvent[]) => {
  const g = newGame(1);
  g.events.push(...events);
  return g;
};

afterEach(() => vi.restoreAllMocks());

describe("drainEvents (R11)", () => {
  it("empties game.events and forwards each event in order", () => {
    const g = withEvents([{ t: 0, type: "spawn", id: 1 }, { t: 5, type: "letter", id: 1 }, { t: 9, type: "wrong" }]);
    const seen: string[] = [];
    const out = drainEvents(g, { onEvent: (e) => seen.push(e.type) });
    expect(g.events).toEqual([]);
    expect(seen).toEqual(["spawn", "letter", "wrong"]);
    expect(out.map((e) => e.type)).toEqual(["spawn", "letter", "wrong"]);
  });

  it("calls onHit once per explode", () => {
    const g = withEvents([{ t: 0, type: "explode", id: 1 }, { t: 1, type: "pop", id: 2 }, { t: 2, type: "explode", id: 3 }]);
    const onHit = vi.fn();
    drainEvents(g, { onHit });
    expect(onHit).toHaveBeenCalledTimes(2);
  });

  it("a throwing onEvent or onHit is logged and stops nothing: later events, onHit and the drain all happen", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const g = withEvents([{ t: 0, type: "explode", id: 1 }, { t: 1, type: "pop", id: 2 }]);
    const seen: string[] = [];
    const onHit = vi.fn(() => { throw new Error("hud"); });
    const out = drainEvents(g, {
      onEvent: (e) => { seen.push(e.type); throw new Error("sound"); },
      onHit,
    });
    expect(seen).toEqual(["explode", "pop"]);
    expect(onHit).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(2);
    expect(g.events).toEqual([]);
    expect(error).toHaveBeenCalledTimes(3);
  });

  it("does nothing without a game", () => {
    expect(drainEvents(null, {})).toEqual([]);
  });
});

describe("safely", () => {
  it("runs the callback, swallows and logs a throw, and accepts undefined", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fn = vi.fn();
    safely(fn);
    safely(undefined);
    expect(() => safely(() => { throw new Error("x"); })).not.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
