import { appBaseUrl } from "@/lib/links";

/** The root event subdomains live under, and the host the app itself answers on (D422). */
export type DomainConfig = { root: string; appHost: string };

export function domainConfig(): DomainConfig {
  const root = (process.env.EVENT_DOMAIN_ROOT || (process.env.NODE_ENV === "production" ? "ecphub.app" : "localhost")).toLowerCase();
  return { root, appHost: new URL(appBaseUrl()).hostname.toLowerCase() };
}

/** The Host header as a bare hostname: lowercase, no port, no trailing FQDN dot. */
export function hostOf(hostHeader: string | null): string {
  return (hostHeader ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/**
 * Hosts that serve the whole app as today (D422). Every *.vercel.app host is main: production's
 * own `ecphub.vercel.app` (the cron, the WhatsApp webhook and the frozen template buttons call it)
 * and every preview deployment.
 */
export function isMainHost(host: string, cfg: DomainConfig): boolean {
  // No Host at all is treated as main: never let a header-less request 404 the whole app.
  return host === "" || host === cfg.appHost || host === cfg.root || host === `www.${cfg.root}`
    || host.endsWith(".vercel.app") || host === "localhost" || host === "127.0.0.1";
}

export const RESERVED_LABELS = ["www", "app", "admin", "api", "mail", "crew", "host", "display", "booth", "scan", "login", "help", "status"] as const;

export type HostResult = { ok: true; host: string } | { ok: false; error: string };

const LABEL = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

/** D424: the label an organiser types, as `<label>.<root>`. */
export function subdomainHost(label: string, root: string): HostResult {
  const l = label.trim().toLowerCase();
  if (!LABEL.test(l)) return { ok: false, error: "Use 3–40 letters, digits or hyphens, not starting or ending with a hyphen." };
  if ((RESERVED_LABELS as readonly string[]).includes(l)) return { ok: false, error: `“${l}” is reserved. Pick another name.` };
  return { ok: true, host: `${l}.${root}` };
}

const DOMAIN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function isSubdomainOf(host: string, root: string): boolean {
  return host.endsWith(`.${root}`);
}

/** D424: a client's own domain, typed as an organiser would - with or without https:// and a slash. */
export function ownDomainHost(input: string, root: string): HostResult {
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (host === root || isSubdomainOf(host, root)) return { ok: false, error: `For an address ending in .${root}, use the subdomain box.` };
  if (host.endsWith(".vercel.app")) return { ok: false, error: "A vercel.app address can't be an event's address." };
  if (!DOMAIN.test(host)) return { ok: false, error: "That doesn't look like a domain. Type it like sk2summit.com." };
  return { ok: true, host };
}
