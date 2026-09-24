import { describe, it, expect } from "vitest";
import { templatePayload } from "@/lib/whatsapp";

describe("templatePayload", () => {
  it("puts the body variables in the order the template numbers them", () => {
    const p = templatePayload({
      to: "60123456789",
      template: "ecphub_uniqueportal",
      bodyParams: ["Lim Hock Cheng", "Ecopia Kick-Off Meeting 2026", "30 September 2026"],
    });
    expect(p.to).toBe("60123456789");
    expect(p.template.name).toBe("ecphub_uniqueportal");
    const body = p.template.components.find((c) => c.type === "body");
    expect(body?.parameters.map((x) => x.text)).toEqual([
      "Lim Hock Cheng", "Ecopia Kick-Off Meeting 2026", "30 September 2026",
    ]);
  });

  it("sends only the token as the button parameter, never the whole URL", () => {
    // Meta stores the prefix with the template and appends this to it. Passing the full
    // link here produces https://.../a/https://.../a/<token>.
    const p = templatePayload({
      to: "60123456789",
      template: "ecphub_uniqueportal",
      bodyParams: ["A"],
      buttonParam: "45c2fbbhmn8g",
    });
    const button = p.template.components.find((c) => c.type === "button");
    expect(button?.sub_type).toBe("url");
    expect(button?.index).toBe("0");
    expect(button?.parameters.map((x) => x.text)).toEqual(["45c2fbbhmn8g"]);
  });

  it("leaves the button out entirely when there is no token to pass", () => {
    const p = templatePayload({ to: "60123456789", template: "hello_world", bodyParams: [] });
    expect(p.template.components.some((c) => c.type === "button")).toBe(false);
  });

  it("omits an empty body component rather than sending an empty parameter list", () => {
    const p = templatePayload({ to: "60123456789", template: "hello_world", bodyParams: [] });
    expect(p.template.components).toEqual([]);
  });

  it("defaults to the language the approved templates were filed under", () => {
    const p = templatePayload({ to: "60123456789", template: "ecphub_uniqueportal", bodyParams: ["A"] });
    expect(p.template.language.code).toBe("en");
  });
});
