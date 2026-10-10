import { describe, expect, it } from "vitest";
import { hostOf, isMainHost, ownDomainHost, subdomainHost, isSubdomainOf } from "@/features/domains/hosts";

const cfg = { root: "ecphub.app", appHost: "ecphub.app" };

describe("hostOf", () => {
  it("lowercases and drops the port", () => {
    expect(hostOf("SK2Summit.ecphub.app:443")).toBe("sk2summit.ecphub.app");
    expect(hostOf("sk2summit.localhost:3000")).toBe("sk2summit.localhost");
    expect(hostOf(null)).toBe("");
  });
});

describe("isMainHost (D422)", () => {
  it("is the app, its root, www, any vercel.app host and localhost", () => {
    for (const h of ["", "ecphub.app", "www.ecphub.app", "ecphub.vercel.app", "ecphub-git-x.vercel.app", "localhost", "127.0.0.1"]) {
      expect(isMainHost(h, cfg), h).toBe(true);
    }
  });
  it("is not an event's address", () => {
    expect(isMainHost("sk2summit.ecphub.app", cfg)).toBe(false);
    expect(isMainHost("sk2summit.com", cfg)).toBe(false);
  });
  it("treats the configured app host as main even when it differs from the root", () => {
    expect(isMainHost("events.example.com", { root: "ecphub.app", appHost: "events.example.com" })).toBe(true);
  });
});

describe("subdomainHost (D424)", () => {
  it("builds the host from a valid label", () => {
    expect(subdomainHost(" SK2Summit ", "ecphub.app")).toEqual({ ok: true, host: "sk2summit.ecphub.app" });
    expect(subdomainHost("kom-2026", "ecphub.app")).toEqual({ ok: true, host: "kom-2026.ecphub.app" });
  });
  it("refuses bad and reserved labels with a sentence", () => {
    expect(subdomainHost("ab", "ecphub.app")).toMatchObject({ ok: false });
    expect(subdomainHost("-kom", "ecphub.app")).toMatchObject({ ok: false });
    expect(subdomainHost("kom_2026", "ecphub.app")).toMatchObject({ ok: false });
    expect(subdomainHost("a".repeat(41), "ecphub.app")).toMatchObject({ ok: false });
    expect(subdomainHost("admin", "ecphub.app")).toEqual({ ok: false, error: "“admin” is reserved. Pick another name." });
  });
});

describe("ownDomainHost (D424)", () => {
  it("accepts a domain typed with or without https:// and a trailing slash", () => {
    expect(ownDomainHost("https://SK2Summit.com/", "ecphub.app")).toEqual({ ok: true, host: "sk2summit.com" });
    expect(ownDomainHost("summit.sk2.com.my", "ecphub.app")).toEqual({ ok: true, host: "summit.sk2.com.my" });
  });
  it("sends addresses under our own root to the subdomain box", () => {
    expect(ownDomainHost("sk2.ecphub.app", "ecphub.app")).toEqual({ ok: false, error: "For an address ending in .ecphub.app, use the subdomain box." });
  });
  it("refuses what is not a domain", () => {
    expect(ownDomainHost("sk2summit", "ecphub.app")).toMatchObject({ ok: false });
    expect(ownDomainHost("sk2 summit.com", "ecphub.app")).toMatchObject({ ok: false });
    expect(ownDomainHost("ecphub.vercel.app", "ecphub.app")).toMatchObject({ ok: false });
  });
});

describe("isSubdomainOf", () => {
  it("is true only for hosts under the root", () => {
    expect(isSubdomainOf("sk2.ecphub.app", "ecphub.app")).toBe(true);
    expect(isSubdomainOf("ecphub.app", "ecphub.app")).toBe(false);
    expect(isSubdomainOf("notecphub.app", "ecphub.app")).toBe(false);
  });
});
