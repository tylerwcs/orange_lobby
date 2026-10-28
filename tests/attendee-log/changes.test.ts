import { describe, it, expect } from "vitest";
import { bulkSetChange, deleteChange, editChange, importChange, people, searchPattern, searchText } from "@/features/attendee-log/lib/changes";
import { labels, person } from "./fixtures";

const mei = () => person({ id: "a1", extra: { table: "12" }, group_id: "g1" });

describe("attendee log change builders", () => {
  it("people pluralises", () => {
    expect(people(1)).toBe("1 person");
    expect(people(6)).toBe("6 people");
  });

  it("editChange returns null when nothing changed", () => {
    expect(editChange(mei(), mei(), labels)).toBeNull();
  });

  it("editChange summary and fields", () => {
    const after = { ...mei(), extra: { table: "14" } };
    const c = editChange(mei(), after, labels)!;
    expect(c.kind).toBe("edit");
    expect(c.summary).toBe("Edited Lee Mei Ling");
    expect(c.people).toEqual([{ attendeeId: "a1", name: "Lee Mei Ling", email: "mei@example.com", fields: [{ label: "Table", before: "12", after: "14" }] }]);
  });

  it("deleteChange keeps a full snapshot", () => {
    const c = deleteChange([mei()], labels)!;
    expect(c.kind).toBe("delete");
    expect(c.summary).toBe("Deleted Lee Mei Ling");
    expect(c.people[0].snapshot).toContainEqual({ label: "Group", value: "Team A" });
    expect(deleteChange([], labels)).toBeNull();
  });

  it("deleteChange of 6 is bulk_delete", () => {
    const six = Array.from({ length: 6 }, (_, i) => person({ id: `a${i}`, name: `P${i}`, email: null }));
    const c = deleteChange(six, labels)!;
    expect(c.kind).toBe("bulk_delete");
    expect(c.summary).toBe("Deleted 6 people");
    expect(c.people).toHaveLength(6);
  });

  it("bulkSetChange skips people whose value is unchanged", () => {
    const rows = [
      { a: person({ id: "a1", name: "A" }), old: "M" },
      { a: person({ id: "a2", name: "B" }), old: "L" },
      { a: person({ id: "a3", name: "C" }), old: "" },
    ];
    const c = bulkSetChange("Shirt size", "L", rows)!;
    expect(c.kind).toBe("bulk_set");
    expect(c.summary).toBe("Set Shirt size to L for 2 people");
    expect(c.people.map((p) => p.attendeeId)).toEqual(["a1", "a3"]);
    expect(c.people[0].fields).toEqual([{ label: "Shirt size", before: "M", after: "L" }]);
    expect(bulkSetChange("Shirt size", "L", [rows[1]])).toBeNull();
    expect(bulkSetChange("Shirt size", "", [rows[0]])!.summary).toBe("Set Shirt size to (blank) for 1 person");
  });

  it("importChange counts and diffs", () => {
    const added = [person({ id: "n1", name: "N1" }), person({ id: "n2", name: "N2" })];
    const before = mei();
    const c = importChange(added, [{ before, after: { ...before, extra: { table: "15" } } }], labels)!;
    expect(c.kind).toBe("import");
    expect(c.summary).toBe("Imported masterlist: 2 added, 1 updated");
    expect(c.people).toHaveLength(3);
    expect(c.people[0].snapshot).toBeDefined();
    expect(c.people[2].fields).toEqual([{ label: "Table", before: "12", after: "15" }]);
    expect(importChange([], [], labels)).toBeNull();
  });

  it("builds an import change for 3,000 people in under 300 ms", () => {
    const keys = Array.from({ length: 10 }, (_, i) => `k${i}`);
    const fields = keys.map((k) => ({ key: k, label: k.toUpperCase(), type: "text" as const }));
    const big = { ...labels, fields };
    const extra = (v: string) => Object.fromEntries(keys.map((k) => [k, v]));
    const added = Array.from({ length: 1500 }, (_, i) => person({ id: `n${i}`, name: `N${i}`, extra: extra("x") }));
    const updated = Array.from({ length: 1500 }, (_, i) => {
      const before = person({ id: `u${i}`, name: `U${i}`, extra: extra("x") });
      return { before, after: { ...before, extra: extra("y") } };
    });
    const t0 = performance.now();
    const c = importChange(added, updated, big)!;
    expect(performance.now() - t0).toBeLessThan(300);
    expect(c.people).toHaveLength(3000);
  });

  it("searchPattern escapes ilike and or-filter characters", () => {
    const p = searchPattern("O'Neil (KL), 50%");
    // Undo the PostgREST quoting (\\ → \, \" → "), leaving the ilike pattern.
    const ilike = p.replace(/\\(["\\])/g, "$1");
    expect(ilike).toBe("O'Neil \\(KL\\)\\, 50\\%");
    // A backslash, a quote and an underscore each survive both layers.
    expect(searchPattern('a"b\\c_d')).toBe('a\\"b\\\\\\\\c\\\\_d');
  });

  it("searchText includes every person's name lower-cased", () => {
    const c = {
      kind: "bulk_delete" as const,
      summary: "Deleted 2 people",
      people: [
        { attendeeId: "a", name: "Lee MEI Ling", email: "Mei@Example.com" },
        { attendeeId: "b", name: "Tan Ah Kow", email: null },
      ],
    };
    expect(searchText(c, "CS Wong", "CS@ecopia.com")).toBe("deleted 2 people cs wong cs@ecopia.com lee mei ling mei@example.com tan ah kow");
  });
});
