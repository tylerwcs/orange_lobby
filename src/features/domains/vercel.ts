import "server-only";

/**
 * Whether a domain is attached to this Vercel project and verified (D424). Read-only: buying and
 * attaching stay in the Vercel dashboard. "unknown" without the env vars, or when Vercel can't
 * be reached - the tab says so instead of guessing.
 */
export type DomainStatus = "live" | "not-added" | "unverified" | "unknown";

export async function vercelDomainStatus(host: string): Promise<DomainStatus> {
  const token = process.env.VERCEL_TOKEN, project = process.env.VERCEL_PROJECT_ID, team = process.env.VERCEL_TEAM_ID;
  if (!token || !project) return "unknown";
  const qs = team ? `?teamId=${encodeURIComponent(team)}` : "";
  try {
    const res = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(host)}${qs}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(3000),
    });
    if (res.status === 404) return "not-added";
    if (!res.ok) return "unknown";
    const body = (await res.json()) as { verified?: boolean };
    return body.verified ? "live" : "unverified";
  } catch {
    return "unknown";
  }
}
