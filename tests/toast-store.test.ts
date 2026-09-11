import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearToasts, dismissToast, getServerToasts, getToasts, subscribeToasts, toast } from "@/lib/toast-store";

beforeEach(() => { vi.useFakeTimers(); clearToasts(); });
afterEach(() => { vi.useRealTimers(); });

describe("toast store", () => {
  it("starts empty and hands the server a stable reference", () => {
    expect(getToasts()).toEqual([]);
    // `useSyncExternalStore` loops forever if the server snapshot is a new array each call.
    expect(getServerToasts()).toBe(getServerToasts());
  });

  it("adds toasts in the order they were raised", () => {
    toast("First");
    toast("Second", "error");
    expect(getToasts().map((t) => [t.message, t.tone])).toEqual([["First", "ok"], ["Second", "error"]]);
  });

  it("gives every toast its own id, so two identical messages are two toasts", () => {
    const a = toast("Saved");
    const b = toast("Saved");
    expect(a).not.toBe(b);
    expect(getToasts()).toHaveLength(2);
  });

  it("publishes a new array each time, so a subscriber actually re-renders", () => {
    const before = getToasts();
    toast("Saved");
    expect(getToasts()).not.toBe(before);
  });

  it("tells subscribers, and stops once they unsubscribe", () => {
    const seen = vi.fn();
    const off = subscribeToasts(seen);
    toast("Saved");
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    toast("Again");
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("dismisses itself after a while", () => {
    toast("Saved");
    vi.advanceTimersByTime(5999);
    expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(getToasts()).toEqual([]);
  });

  it("leaves an error up longer, since it is the one worth reading twice", () => {
    toast("Nope", "error");
    vi.advanceTimersByTime(6000);
    expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(6000);
    expect(getToasts()).toEqual([]);
  });

  it("dismisses one without disturbing the others", () => {
    const first = toast("First");
    toast("Second");
    dismissToast(first);
    expect(getToasts().map((t) => t.message)).toEqual(["Second"]);
  });

  it("shrugs off a dismiss for something already gone", () => {
    const id = toast("Saved");
    dismissToast(id);
    expect(() => dismissToast(id)).not.toThrow();
    vi.advanceTimersByTime(20000);
    expect(getToasts()).toEqual([]);
  });
});
