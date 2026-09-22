import { describe, expect, it } from "vitest";
import { buildFormsWorkbook } from "@/lib/exports";

const sheet = {
  formName: "Daily check-in",
  questions: [{ key: "mood", label: "Mood" }, { key: "note", label: "Note" }],
  rows: [{ name: "Tan Wei Ming", email: "t@example.com", category: "Delegate", submittedOn: "2026-09-28", answers: { mood: "Good", note: "" } }],
};

describe("buildFormsWorkbook", () => {
  it("gives each form its own sheet, named after it", () => {
    const wb = buildFormsWorkbook([sheet]);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Daily check-in"]);
  });

  it("puts one column per question after the fixed columns", () => {
    const ws = buildFormsWorkbook([sheet]).worksheets[0];
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Email", "Category", "Submitted", "Mood", "Note"]);
  });

  it("writes an answer under its own question, not by position", () => {
    const ws = buildFormsWorkbook([{ ...sheet, rows: [{ ...sheet.rows[0], answers: { note: "Only a note" } }] }]).worksheets[0];
    expect(ws.getRow(2).getCell(5).value).toBe("");
    expect(ws.getRow(2).getCell(6).value).toBe("Only a note");
  });

  it("says so rather than writing an empty file when there are no forms", () => {
    const wb = buildFormsWorkbook([]);
    expect(wb.worksheets).toHaveLength(1);
    expect(wb.worksheets[0].getRow(1).getCell(1).value).toMatch(/no forms/i);
  });
});
