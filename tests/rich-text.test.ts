import { describe, it, expect } from "vitest";
import { cleanRichText, isRichTextEmpty, normalizeLink, splitSections, toRichHtml } from "@/lib/rich-text";

describe("toRichHtml", () => {
  it("turns plain text into paragraphs, keeping single line breaks", () => {
    expect(toRichHtml("First line\nsecond line\n\nNew paragraph")).toBe("<p>First line<br>second line</p><p>New paragraph</p>");
  });
  it("escapes plain text rather than letting it become markup", () => {
    expect(toRichHtml("5 < 6 & \"quotes\"")).toBe("<p>5 &lt; 6 &amp; &quot;quotes&quot;</p>");
  });
  it("leaves HTML the editor wrote as it is", () => {
    expect(toRichHtml("<p>Hi <strong>there</strong></p>")).toBe("<p>Hi <strong>there</strong></p>");
  });
  it("gives nothing for nothing", () => {
    expect(toRichHtml(null)).toBe("");
    expect(toRichHtml("   ")).toBe("");
  });
});

describe("isRichTextEmpty", () => {
  it("treats an editor with nothing typed as empty", () => {
    expect(isRichTextEmpty("<p></p>")).toBe(true);
    expect(isRichTextEmpty("<p> </p><p><br></p>")).toBe(true);
    expect(isRichTextEmpty("<p>&nbsp;</p>")).toBe(true);
    expect(isRichTextEmpty("")).toBe(true);
  });
  it("does not treat an image or any text as empty", () => {
    expect(isRichTextEmpty('<p><img src="https://x.co/a.png" alt=""></p>')).toBe(false);
    expect(isRichTextEmpty("<p>a</p>")).toBe(false);
  });
});

describe("splitSections", () => {
  it("puts everything under About when there is no section heading", () => {
    expect(splitSections("<p>Hello</p>")).toEqual({ intro: "<p>Hello</p>", sections: [] });
  });
  it("starts a new section at each h2, with the text before the first one as the intro", () => {
    expect(splitSections("<p>Intro</p><h2>Scoring</h2><blockquote><p>1 point</p></blockquote><h2>Prizes</h2><p>RM40,000</p>")).toEqual({
      intro: "<p>Intro</p>",
      sections: [
        { title: "Scoring", html: "<blockquote><p>1 point</p></blockquote>" },
        { title: "Prizes", html: "<p>RM40,000</p>" },
      ],
    });
  });
  it("has no intro when the text starts with a section heading", () => {
    expect(splitSections("<h2>Rules</h2><p>Be kind</p>")).toEqual({ intro: "", sections: [{ title: "Rules", html: "<p>Be kind</p>" }] });
  });
  it("keeps h3 inside its section rather than splitting on it", () => {
    expect(splitSections("<h2>Rules</h2><h3>Photos</h3><p>One a month</p>").sections).toEqual([
      { title: "Rules", html: "<h3>Photos</h3><p>One a month</p>" },
    ]);
  });
  it("drops a section heading with no words in it, and blank bodies become empty", () => {
    expect(splitSections("<p>Intro</p><h2> </h2><p>More</p><h2>Prizes</h2><p></p>")).toEqual({
      intro: "<p>Intro</p><p>More</p>",
      sections: [{ title: "Prizes", html: "" }],
    });
  });
  it("uses the heading's text as the title, without the tags inside it", () => {
    expect(splitSections("<h2>Medal <strong>&amp;</strong> prizes</h2><p>x</p>").sections[0].title).toBe("Medal & prizes");
  });
  it("treats an empty intro as none", () => {
    expect(splitSections("<p></p><h2>A</h2><p>b</p>").intro).toBe("");
  });
});

describe("normalizeLink", () => {
  it("keeps a full web, email or phone link as it is", () => {
    expect(normalizeLink("https://perkeso.gov.my/x")).toBe("https://perkeso.gov.my/x");
    expect(normalizeLink("mailto:a@b.co")).toBe("mailto:a@b.co");
    expect(normalizeLink("tel:+60123456789")).toBe("tel:+60123456789");
  });
  it("adds https to a bare address, the way people type them", () => {
    expect(normalizeLink(" activatwork.perkeso.gov.my ")).toBe("https://activatwork.perkeso.gov.my");
  });
  it("turns a bare email address into a mailto link", () => {
    expect(normalizeLink("hello@ecopiaevents.com")).toBe("mailto:hello@ecopiaevents.com");
  });
  it("refuses anything that is not a link the page would keep", () => {
    expect(normalizeLink("javascript:alert(1)")).toBeNull();
    expect(normalizeLink("")).toBeNull();
    expect(normalizeLink("not a link")).toBeNull();
  });
});

describe("cleanRichText", () => {
  it("stores an empty editor as no text at all", () => {
    expect(cleanRichText("<p></p>")).toBeNull();
    expect(cleanRichText("  ")).toBeNull();
  });
  it("drops the blank lines an editor leaves at either end", () => {
    expect(cleanRichText("<p><br></p><h2>Prizes</h2><p>RM500</p><p></p><p> </p>")).toBe("<h2>Prizes</h2><p>RM500</p>");
  });
  it("stores what the editor wrote, cleaned", () => {
    expect(cleanRichText('<h2>Prizes</h2><p onclick="x()">RM40,000</p><script>bad()</script>')).toBe("<h2>Prizes</h2><p>RM40,000</p>");
  });
});
