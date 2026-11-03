import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EARLY_TOLERANCE_MS, RUN_CAP_MS, SUBMIT_GRACE_MS } from "@/features/qualifier/game/rules";

// Migrations 0120 and 0124 (D812) repeat some game constants as SQL literals (the submit window,
// the run cap, the early tolerance); 0124 replaced the functions that hold them. Pin both sides
// so a change to rules.ts can't silently disagree with the SQL.
const sql = readFileSync("supabase/migrations/0124_slime_three_minutes.sql", "utf8");

describe("0124 SQL literals mirror rules.ts", () => {
  it("the submit window is RUN_CAP_MS + SUBMIT_GRACE_MS = 4 minutes", () => {
    expect(RUN_CAP_MS + SUBMIT_GRACE_MS).toBe(4 * 60_000);
    expect(sql.match(/interval '4 minutes'/g)).toHaveLength(3);
    expect(sql).not.toContain("21 minutes");
  });

  it("the run cap is RUN_CAP_MS = 180000", () => {
    expect(RUN_CAP_MS).toBe(180_000);
    expect(sql).toContain("p_ended_ms > 180000");
  });

  it("the early tolerance is EARLY_TOLERANCE_MS = 2000", () => {
    expect(EARLY_TOLERANCE_MS).toBe(2000);
    expect(sql).toContain("p_ended_ms - 2000");
  });
});
