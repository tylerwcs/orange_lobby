import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "@/lib/sanitize";

describe("sanitizeHtml", () => {
  it("keeps allowed tags, strips scripts and event handlers", () => {
    const out = sanitizeHtml('<p onclick="x()">Hi <script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="https://ok.com">ok</a></p>');
    expect(out).not.toContain("script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("javascript:");
    expect(out).toContain('<a href="https://ok.com">ok</a>');
  });
  it("drops unknown tags but keeps their text", () => {
    expect(sanitizeHtml("<div><span>text</span></div>")).toBe("text");
  });
});
