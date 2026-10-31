import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EARLY_TOLERANCE_MS, RUN_CAP_MS, SUBMIT_GRACE_MS } from "@/features/qualifier/game/rules";

// Migration 0119 repeats some game constants as SQL literals (the submit window, the run cap, the
// early tolerance). Pin both sides so a change to rules.ts can't silently disagree with the SQL.
const sql = readFileSync("supabase/migrations/0119_slime_qualifier.sql", "utf8");

describe("0119 SQL literals mirror rules.ts", () => {
  it("the submit window is RUN_CAP_MS + SUBMIT_GRACE_MS = 21 minutes", () => {
    expect(RUN_CAP_MS + SUBMIT_GRACE_MS).toBe(21 * 60_000);
    expect(sql).toContain("interval '21 minutes'");
  });

  it("the run cap is RUN_CAP_MS = 1200000", () => {
    expect(RUN_CAP_MS).toBe(1_200_000);
    expect(sql).toContain("1200000");
  });

  it("the early tolerance is EARLY_TOLERANCE_MS = 2000", () => {
    expect(EARLY_TOLERANCE_MS).toBe(2000);
    expect(sql).toContain("p_ended_ms - 2000");
  });
});
