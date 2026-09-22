import { describe, expect, it } from "vitest";
import { buildFormsWorkbook, retiredAnswerKeys } from "@/lib/exports";

const sheet = {
  formName: "Daily check-in",
  questions: [{ key: "mood", label: "Mood" }, { key: "note", label: "Note" }],
  rows: [{ name: "Tan Wei Ming", email: "t@example.com", category: "Delegate", submittedOn: "2026-09-28", createdAt: "2026-09-28T01:23:45.000Z", answers: { mood: "Good", note: "" } }],
};

describe("buildFormsWorkbook", () => {
  it("gives each form its own sheet, named after it", () => {
    const wb = buildFormsWorkbook([sheet]);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Daily check-in"]);
  });

  it("puts one column per question after the fixed columns, including the timestamp spec §6 requires", () => {
    const ws = buildFormsWorkbook([sheet]).worksheets[0];
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Email", "Category", "Submitted", "Timestamp", "Mood", "Note"]);
  });

  it("writes an answer under its own question, not by position", () => {
    const ws = buildFormsWorkbook([{ ...sheet, rows: [{ ...sheet.rows[0], answers: { note: "Only a note" } }] }]).worksheets[0];
    expect(ws.getRow(2).getCell(6).value).toBe("");
    expect(ws.getRow(2).getCell(7).value).toBe("Only a note");
  });

  it("writes the timestamp as its own column right after Submitted", () => {
    const ws = buildFormsWorkbook([sheet]).worksheets[0];
    expect(ws.getRow(2).getCell(4).value).toBe("2026-09-28");
    expect(ws.getRow(2).getCell(5).value).toBe("2026-09-28T01:23:45.000Z");
  });

  it("says so rather than writing an empty file when there are no forms", () => {
    const wb = buildFormsWorkbook([]);
    expect(wb.worksheets).toHaveLength(1);
    expect(wb.worksheets[0].getRow(1).getCell(1).value).toMatch(/no forms/i);
  });

  // A question's key can be renamed in the admin editor after submissions already exist under
  // the old one. Answers are immutable (D166), so a rename must not make a real answer
  // unreachable through the export — this is the case a future refactor of buildFormsWorkbook
  // would silently undo if it went back to projecting `answers[q.key]` over `questions` alone.
  it("appends a column for an answer key a rename retired, without reordering the current ones", () => {
    const renamed = {
      ...sheet,
      rows: [{ ...sheet.rows[0], answers: { mood: "Good", note: "", receipt: "org/ev/form/submission-1.png" } }],
    };
    const ws = buildFormsWorkbook([renamed]).worksheets[0];
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Email", "Category", "Submitted", "Timestamp", "Mood", "Note", "receipt (retired)"]);
    expect(ws.getRow(2).getCell(8).value).toBe("org/ev/form/submission-1.png");
  });

  it("appends one retired column per orphaned key even when only some rows still carry it", () => {
    const withRetired = {
      ...sheet,
      rows: [
        { ...sheet.rows[0], answers: { mood: "Good", note: "", old_key: "kept" } as Record<string, string> },
        { ...sheet.rows[0], answers: { mood: "Fair", note: "" } as Record<string, string> },
      ],
    };
    const ws = buildFormsWorkbook([withRetired]).worksheets[0];
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Email", "Category", "Submitted", "Timestamp", "Mood", "Note", "old_key (retired)"]);
    expect(ws.getRow(2).getCell(8).value).toBe("kept");
    expect(ws.getRow(3).getCell(8).value).toBe("");
  });
});

describe("retiredAnswerKeys", () => {
  it("is empty when every answer key is still a current question", () => {
    expect(retiredAnswerKeys(["mood", "note"], [{ mood: "Good", note: "" }])).toEqual([]);
  });

  it("names a key that shows up in the data but not among current questions", () => {
    expect(retiredAnswerKeys(["mood"], [{ mood: "Good", receipt: "path.png" }])).toEqual(["receipt"]);
  });

  it("reports each retired key once, in first-seen order, across many rows", () => {
    expect(retiredAnswerKeys([], [{ b: "1" }, { a: "1", b: "2" }, { c: "1" }])).toEqual(["b", "a", "c"]);
  });
});
