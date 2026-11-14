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

// Migration 0139 (D907, D908) keeps two things the code leans on: the Malaysia day and minute
// (hours.ts does the same sums at UTC+8), and defaults that let a caller leave the kind out.
const limits = readFileSync("supabase/migrations/0139_slime_attempt_limits.sql", "utf8");

describe("0139 SQL mirrors hours.ts and db.ts", () => {
  it("days and hours are Malaysia's", () => {
    expect(limits.match(/at time zone 'Asia\/Kuala_Lumpur'/g)).toHaveLength(3);
  });
  it("a start without a kind is official, and only official runs make the best", () => {
    expect(limits).toContain("p_kind text default 'official'");
    expect(limits).toContain("and r.kind = 'official'");
  });
  it("the old signatures are dropped, so a named call can't be ambiguous", () => {
    expect(limits).toContain("drop function public.qualifier_start(uuid, uuid, int, int);");
    expect(limits).toContain("drop function public.qualifier_save_settings(uuid, timestamptz, timestamptz, text[]);");
  });
});
