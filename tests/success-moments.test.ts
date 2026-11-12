import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MOMENT_TIMING, beginMoment, endMoment, getMoment, getServerMoment, holdFor, takeBefore,
  momentFailed, momentSucceeded, momentUnanswered, resetMoment, subscribeMoment,
} from "@/features/success-moments/store";
import { clearToasts, getToasts, toast } from "@/lib/toast-store";

beforeEach(() => { vi.useFakeTimers(); resetMoment(); clearToasts(); });
afterEach(() => { vi.useRealTimers(); });

const phase = () => getMoment().phase;

describe("success moment (D902)", () => {
  it("starts idle and hands the server a stable reference", () => {
    expect(phase()).toBe("idle");
    expect(getServerMoment()).toBe(getServerMoment());
  });

  it("plays busy, ok, closing, landing, idle after the server's yes", () => {
    beginMoment("book");
    expect(phase()).toBe("busy");
    expect(momentSucceeded()).toBe(true);
    expect(phase()).toBe("ok");
    vi.advanceTimersByTime(MOMENT_TIMING.hold);
    expect(phase()).toBe("closing");
    vi.advanceTimersByTime(MOMENT_TIMING.close);
    expect(phase()).toBe("landing");
    vi.advanceTimersByTime(MOMENT_TIMING.settle);
    expect(phase()).toBe("idle");
  });

  it("closes at once with reduced motion: there is no tick to wait for", () => {
    beginMoment("book");
    momentSucceeded(true);
    vi.advanceTimersByTime(0);
    expect(phase()).toBe("closing");
  });

  it("holds the page an ok flash came back with until landing, then lets it in", async () => {
    beginMoment("book");
    const hold = holdFor();
    expect(hold).toBeInstanceOf(Promise);
    let open = false;
    void hold!.then(() => { open = true; });
    await Promise.resolve(); // the yes is learned after the render, not during it
    expect(phase()).toBe("ok");
    expect(holdFor()).toBe(hold); // a re-render waits on the same promise
    vi.advanceTimersByTime(MOMENT_TIMING.hold);
    expect(holdFor()).toBe(hold);
    vi.advanceTimersByTime(MOMENT_TIMING.close);
    await Promise.resolve();
    expect(open).toBe(true);
    expect(holdFor()).toBeNull();
  });

  it("never holds a page when no moment is playing", () => {
    expect(holdFor()).toBeNull();
  });

  it("lets a held page in if the moment ends some other way", async () => {
    beginMoment("book");
    let open = false;
    void holdFor()!.then(() => { open = true; });
    endMoment();
    await Promise.resolve();
    expect(open).toBe(true);
  });

  it("counts the flash's own effect, after the gate's yes, as the same yes", () => {
    beginMoment("book");
    momentSucceeded();
    vi.advanceTimersByTime(MOMENT_TIMING.hold + MOMENT_TIMING.close);
    expect(phase()).toBe("landing");
    expect(momentSucceeded()).toBe(true);
    expect(phase()).toBe("landing");
  });

  it("hands the keys seen at the press to the glow once", () => {
    beginMoment("book", new Set(["seat:a"]));
    expect(takeBefore()).toEqual(new Set(["seat:a"]));
    expect(takeBefore()).toBeNull();
  });

  it("claims no success when nothing was waiting, so other pages' toasts show as before", () => {
    expect(momentSucceeded()).toBe(false);
    expect(phase()).toBe("idle");
  });

  it("goes straight back to idle on a refusal", () => {
    beginMoment("book");
    momentFailed();
    expect(phase()).toBe("idle");
  });

  it("lets only the button that started it give up for want of an answer", () => {
    beginMoment("book");
    momentUnanswered("someone-else");
    expect(phase()).toBe("busy");
    momentUnanswered("book");
    expect(phase()).toBe("idle");
  });

  it("never holds a page for good when no answer comes", () => {
    beginMoment("book");
    vi.advanceTimersByTime(MOMENT_TIMING.stuck);
    expect(phase()).toBe("idle");
  });

  it("numbers each moment, and keeps the number through idle, so a dialog closes once per moment", () => {
    beginMoment("a");
    const first = getMoment().seq;
    endMoment();
    expect(getMoment().seq).toBe(first);
    beginMoment("b");
    expect(getMoment().seq).toBe(first + 1);
  });

  it("tells subscribers, and stops once they unsubscribe", () => {
    const seen = vi.fn();
    const off = subscribeMoment(seen);
    beginMoment("book");
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    momentFailed();
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe("quiet toasts (D902)", () => {
  it("keep the words for the screen reader and say they are not to be shown", () => {
    toast("You're booked", "ok", { quiet: true });
    toast("Saved");
    expect(getToasts().map((t) => [t.message, t.quiet ?? false])).toEqual([["You're booked", true], ["Saved", false]]);
  });
});
