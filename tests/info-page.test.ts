import { describe, expect, it } from "vitest";
import { appendImage } from "@/lib/info-page";
import { sanitizeHtml } from "@/lib/sanitize";

const URL = "https://example.supabase.co/storage/v1/object/public/event-media/o/e/info-abc123.png";

describe("appendImage", () => {
  it("is the whole page when there was nothing there", () => {
    expect(appendImage("", URL, "Floor plan")).toBe(`<img src="${URL}" alt="Floor plan">`);
  });

  it("treats a page that has never been written as empty", () => {
    expect(appendImage(null, URL, "Floor plan")).toBe(`<img src="${URL}" alt="Floor plan">`);
  });

  it("leaves what was already written exactly as it was", () => {
    const before = "<h2>Getting here</h2>\n<p>Take the MRT.</p>";
    expect(appendImage(before, URL, "Map")).toBe(`${before}\n<img src="${URL}" alt="Map">`);
  });

  it("does not pile up blank lines under a page that ends in whitespace", () => {
    expect(appendImage("<p>Hello</p>\n\n  ", URL, "Map")).toBe(`<p>Hello</p>\n<img src="${URL}" alt="Map">`);
  });

  it("cannot be broken out of by a quote in the description", () => {
    const out = appendImage("", URL, 'Say "hello"');
    expect(out).toBe(`<img src="${URL}" alt="Say &quot;hello&quot;">`);
  });

  it("escapes markup in the description rather than writing a tag", () => {
    const out = appendImage("", URL, "<script>x</script> & co");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&amp; co");
  });

  it("accepts no description at all", () => {
    expect(appendImage("", URL, "")).toBe(`<img src="${URL}" alt="">`);
  });

  /**
   * The one that matters: the tag this writes has to be a tag the info page's own
   * sanitiser keeps. If these two ever disagree, every uploaded image silently vanishes
   * from the page it was just added to.
   */
  it("writes a tag that sanitizeHtml keeps", () => {
    const out = appendImage("<p>Hi</p>", URL, "Map");
    expect(sanitizeHtml(out)).toContain(`src="${URL}"`);
  });
});
