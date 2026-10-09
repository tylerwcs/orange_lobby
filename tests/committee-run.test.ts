import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  due: [] as { id: string; event_id: string }[],
  events: {} as Record<string, { id: string; name: string; committee_alert_numbers: string[] }>,
  claimed: [] as string[][],
}));
const sendTemplate = vi.hoisted(() => vi.fn());
vi.mock("@/features/activities/db/activity-requests", () => ({
  listDueRequests: async () => state.due,
  claimForReminder: async (ids: string[]) => { state.claimed.push(ids); return ids; },
}));
vi.mock("@/lib/db/events", () => ({ getEvent: async (id: string) => state.events[id] ?? null }));
vi.mock("@/lib/whatsapp", () => ({ sendTemplate }));

const { runCommitteeReminders } = await import("@/lib/committee-run");

beforeEach(() => {
  state.due = []; state.events = {}; state.claimed = [];
  sendTemplate.mockReset();
  sendTemplate.mockResolvedValue({ ok: true, wamid: "w" });
});

describe("runCommitteeReminders", () => {
  it("sends one message per number per event, counting that event's due requests", async () => {
    state.due = [{ id: "r1", event_id: "e1" }, { id: "r2", event_id: "e1" }];
    state.events.e1 = { id: "e1", name: "Kick-Off", committee_alert_numbers: ["60123456789", "60198765432"] };
    expect(await runCommitteeReminders(new Date())).toEqual({ events: 1, requests: 2, sent: 2, failed: 0 });
    expect(sendTemplate).toHaveBeenCalledWith({
      to: "60123456789", template: "ecphub_committee_pending",
      bodyParams: ["2 booking change requests", "Kick-Off"], buttonParam: "e1",
    });
    expect(state.claimed).toEqual([["r1", "r2"]]);
  });

  it("leaves an event with no numbers alone, un-stamped, so adding numbers later picks it up", async () => {
    state.due = [{ id: "r1", event_id: "e1" }];
    state.events.e1 = { id: "e1", name: "Kick-Off", committee_alert_numbers: [] };
    expect(await runCommitteeReminders(new Date())).toEqual({ events: 0, requests: 0, sent: 0, failed: 0 });
    expect(state.claimed).toEqual([]);
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("counts a refused send as failed and still keeps the stamp", async () => {
    state.due = [{ id: "r1", event_id: "e1" }];
    state.events.e1 = { id: "e1", name: "Kick-Off", committee_alert_numbers: ["60123456789"] };
    sendTemplate.mockResolvedValue({ ok: false, code: 132001, title: "Template does not exist" });
    expect(await runCommitteeReminders(new Date())).toEqual({ events: 1, requests: 1, sent: 0, failed: 1 });
    expect(state.claimed).toEqual([["r1"]]);
  });
});
