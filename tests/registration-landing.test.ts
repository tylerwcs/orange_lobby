import { describe, it, expect } from "vitest";
import { resolveTokenView, registerLanding } from "@/features/registration-queue/lib/landing";
import type { RegistrationEntryState } from "@/lib/types";

const active = { id: "a1", cancelled_at: null as string | null };
const cancelled = { id: "a1", cancelled_at: "2026-10-01T00:00:00Z" as string | null };
const entry = (state: RegistrationEntryState) => ({ id: "e1", state });

describe("resolveTokenView (D689, D695)", () => {
  it("gives an active attendee the portal, whatever entry shares the token", () => {
    expect(resolveTokenView(active, null)).toEqual({ kind: "portal", attendee: active });
    expect(resolveTokenView(active, entry("registered")).kind).toBe("portal");
    expect(resolveTokenView(active, entry("waiting")).kind).toBe("portal");
  });

  it("gives an entry in a queue state the queue card", () => {
    for (const s of ["waiting", "pending", "declined", "left", "removed"] as const) {
      expect(resolveTokenView(null, entry(s))).toEqual({ kind: "queue", entry: entry(s) });
    }
  });

  it("puts the entry before the cancelled card when a returning person shares the token", () => {
    expect(resolveTokenView(cancelled, entry("waiting")).kind).toBe("queue");
    expect(resolveTokenView(cancelled, entry("left")).kind).toBe("queue");
  });

  it("falls back to the cancelled card for a registered entry or none", () => {
    expect(resolveTokenView(cancelled, entry("registered"))).toEqual({ kind: "cancelled", attendee: cancelled });
    expect(resolveTokenView(cancelled, null).kind).toBe("cancelled");
  });

  it("is missing with neither, or only a registered entry", () => {
    expect(resolveTokenView(null, null)).toEqual({ kind: "missing" });
    expect(resolveTokenView(null, entry("registered"))).toEqual({ kind: "missing" });
  });
});

describe("registerLanding (D634, D690, D695)", () => {
  it("sends registered and updated people where they went before", () => {
    for (const o of ["registered", "updated"] as const) {
      expect(registerLanding(o, { showsDone: true, waitlistForm: false })).toEqual({ to: "done" });
      expect(registerLanding(o, { showsDone: false, waitlistForm: false })).toEqual({ to: "link", filled: false });
      expect(registerLanding(o, { showsDone: true, waitlistForm: true })).toEqual({ to: "done" });
    }
  });

  it("never shows the done page to someone waiting or pending", () => {
    expect(registerLanding("waiting", { showsDone: true, waitlistForm: true })).toEqual({ to: "link", filled: false });
    expect(registerLanding("pending", { showsDone: true, waitlistForm: false })).toEqual({ to: "link", filled: false });
  });

  it("says the event filled up only when the normal form landed on the waiting list", () => {
    expect(registerLanding("waiting", { showsDone: false, waitlistForm: false })).toEqual({ to: "link", filled: true });
    expect(registerLanding("waiting", { showsDone: false, waitlistForm: true })).toEqual({ to: "link", filled: false });
  });
});
