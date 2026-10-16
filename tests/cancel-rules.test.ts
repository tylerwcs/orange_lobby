import { describe, it, expect } from "vitest";
import { canSelfCancel, registrationOpenNow, klDayTime, klDay, cancelledLabel, parseCancelReason, CANCEL_REASON_MAX } from "@/features/cancel/lib/rules";

const now = new Date("2026-10-15T04:00:00Z"); // 12:00 in KL
const ev = { status: "live" as const, self_cancel: true, self_cancel_closes_at: null as string | null };
const a = { cancelled_at: null as string | null };

describe("canSelfCancel (D584)", () => {
  it("allows a live or draft event with the switch on, before the cut-off, not checked in", () => {
    expect(canSelfCancel(ev, a, false, now)).toEqual({ ok: true });
    expect(canSelfCancel({ ...ev, status: "draft" }, a, false, now)).toEqual({ ok: true });
    expect(canSelfCancel({ ...ev, self_cancel_closes_at: "2026-10-16T00:00:00Z" }, a, false, now)).toEqual({ ok: true });
  });

  it("refuses with the reason, in this order", () => {
    expect(canSelfCancel(ev, { cancelled_at: "2026-10-14T00:00:00Z" }, false, now)).toEqual({ ok: false, reason: "You've already cancelled." });
    expect(canSelfCancel({ ...ev, self_cancel: false }, a, false, now)).toEqual({ ok: false, reason: "Cancelling isn't available for this event." });
    expect(canSelfCancel({ ...ev, status: "archived" }, a, false, now)).toEqual({ ok: false, reason: "This event has ended." });
    expect(canSelfCancel({ ...ev, self_cancel_closes_at: "2026-10-15T02:00:00Z" }, a, false, now)).toEqual({ ok: false, reason: "Cancelling closed on 15 Oct, 10:00." });
    expect(canSelfCancel(ev, a, true, now)).toEqual({ ok: false, reason: "You've already checked in, so your registration can't be cancelled." });
  });

  it("refuses a second request while one waits (D595)", () => {
    expect(canSelfCancel(ev, { cancelled_at: null, cancel_requested_at: "2026-10-15T01:00:00Z" }, false, now))
      .toEqual({ ok: false, reason: "You've already asked to cancel." });
  });
});

describe("registrationOpenNow", () => {
  const r = { status: "live" as const, registration_open: true, registration_closes_at: null as string | null };

  it("follows the switch, the closing time and archive", () => {
    expect(registrationOpenNow(r, now)).toBe(true);
    expect(registrationOpenNow({ ...r, registration_open: false }, now)).toBe(false);
    expect(registrationOpenNow({ ...r, registration_closes_at: "2026-10-15T03:00:00Z" }, now)).toBe(false);
    expect(registrationOpenNow({ ...r, status: "archived" }, now)).toBe(false);
  });
});

describe("dates on the Malaysian calendar", () => {
  it("formats day and time in KL", () => {
    expect(klDayTime("2026-10-21T10:00:00Z")).toBe("21 Oct, 18:00");
    expect(klDay("2026-10-20T17:00:00Z")).toBe("21 Oct");
    expect(cancelledLabel("2026-10-20T17:00:00Z")).toBe("Cancelled · 21 Oct");
  });
});

describe("parseCancelReason (D613)", () => {
  it("trims and keeps the text", () => {
    expect(parseCancelReason("  Clash with a client visit \n")).toEqual({ reason: "Clash with a client visit" });
  });
  it("refuses empty, blank or missing", () => {
    for (const raw of ["", "   \n ", null, undefined, 42]) expect(parseCancelReason(raw)).toEqual({ error: "Tell the organiser why you're cancelling." });
  });
  it("allows the limit, refuses one over, counting characters not bytes", () => {
    expect(parseCancelReason("é".repeat(CANCEL_REASON_MAX))).toEqual({ reason: "é".repeat(CANCEL_REASON_MAX) });
    expect(parseCancelReason("x".repeat(CANCEL_REASON_MAX + 1))).toEqual({ error: "Keep the reason to 500 characters or fewer." });
  });
});
