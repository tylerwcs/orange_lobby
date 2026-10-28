import { describe, it, expect } from "vitest";
import { whatChanged } from "@/features/attendee-log/lib/what-changed";
import type { PersonChange } from "@/features/attendee-log/types";

const p = (id: string, fields?: { label: string; before: string; after: string }[]): PersonChange => ({ attendeeId: id, name: id, email: null, fields });

describe("whatChanged", () => {
  it("one person, one field: label with before and after", () => {
    expect(whatChanged({ kind: "edit", people: [p("a", [{ label: "Table", before: "12", after: "14" }])] }))
      .toEqual({ label: "Table", before: "12", after: "14" });
    expect(whatChanged({ kind: "edit", people: [p("a", [{ label: "Table", before: "", after: "14" }])] }))
      .toEqual({ label: "Table", before: "", after: "14" });
  });

  it("bulk_set where everyone shares the label and the new value: label and after only", () => {
    const f = (before: string) => [{ label: "Table", before, after: "5" }];
    expect(whatChanged({ kind: "bulk_set", people: [p("a", f("1")), p("b", f("2"))] })).toEqual({ label: "Table", after: "5" });
  });

  it("bulk_set that does not share one label and value is null", () => {
    expect(whatChanged({ kind: "bulk_set", people: [p("a", [{ label: "Table", before: "1", after: "5" }]), p("b", [{ label: "Table", before: "1", after: "6" }])] })).toBeNull();
    expect(whatChanged({ kind: "bulk_set", people: [] })).toBeNull();
  });

  it("several fields, several people, or a delete is null", () => {
    expect(whatChanged({ kind: "edit", people: [p("a", [{ label: "Table", before: "1", after: "2" }, { label: "Group", before: "A", after: "B" }])] })).toBeNull();
    expect(whatChanged({ kind: "round_rename", people: [p("a", [{ label: "Round", before: "R1", after: "R2" }]), p("b", [{ label: "Round", before: "R1", after: "R2" }])] })).toBeNull();
    expect(whatChanged({ kind: "delete", people: [{ attendeeId: "a", name: "A", email: null, snapshot: [{ label: "Table", value: "1" }] }] })).toBeNull();
  });
});
