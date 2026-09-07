import { describe, it, expect } from "vitest";
import { parseExtraJson } from "@/lib/attendee-extra";

describe("parseExtraJson", () => {
  it("treats null as an empty object", () => {
    const result = parseExtraJson(null);
    expect(result).toEqual({ ok: true, extra: {} });
  });

  it("treats undefined as an empty object", () => {
    const result = parseExtraJson(undefined);
    expect(result).toEqual({ ok: true, extra: {} });
  });

  it("treats an empty string as an empty object", () => {
    const result = parseExtraJson("");
    expect(result).toEqual({ ok: true, extra: {} });
  });

  it("treats a whitespace-only string as an empty object", () => {
    const result = parseExtraJson("   \n\t  ");
    expect(result).toEqual({ ok: true, extra: {} });
  });

  it("accepts a valid JSON object with string values", () => {
    const result = parseExtraJson('{"tshirt": "M", "remarks": "vip"}');
    expect(result).toEqual({ ok: true, extra: { tshirt: "M", remarks: "vip" } });
  });

  it("accepts a valid JSON object with numeric values, stringifying them", () => {
    const result = parseExtraJson('{"tableCount": 3, "score": 4.5}');
    expect(result).toEqual({ ok: true, extra: { tableCount: "3", score: "4.5" } });
  });

  it("accepts an empty JSON object", () => {
    const result = parseExtraJson("{}");
    expect(result).toEqual({ ok: true, extra: {} });
  });

  it("rejects a JSON array", () => {
    const result = parseExtraJson("[1,2,3]");
    expect(result).toEqual({ ok: false, error: "Extra must be a JSON object" });
  });

  it("rejects a bare JSON string", () => {
    const result = parseExtraJson('"hello"');
    expect(result).toEqual({ ok: false, error: "Extra must be a JSON object" });
  });

  it("rejects a bare JSON number", () => {
    const result = parseExtraJson("42");
    expect(result).toEqual({ ok: false, error: "Extra must be a JSON object" });
  });

  it("rejects JSON null", () => {
    const result = parseExtraJson("null");
    expect(result).toEqual({ ok: false, error: "Extra must be a JSON object" });
  });

  it("rejects invalid JSON", () => {
    const result = parseExtraJson("{not valid json");
    expect(result).toEqual({ ok: false, error: "Extra is not valid JSON" });
  });

  it("rejects an object with a non-string/number value", () => {
    const result = parseExtraJson('{"flag": true}');
    expect(result).toEqual({ ok: false, error: "Extra must be a JSON object" });
  });

  it("rejects an object with a nested object value", () => {
    const result = parseExtraJson('{"nested": {"a": 1}}');
    expect(result).toEqual({ ok: false, error: "Extra must be a JSON object" });
  });
});
