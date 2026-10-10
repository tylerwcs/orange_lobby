import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { domainConfig, hostOf, isMainHost, lookupHost, redirectTarget, routeEventPath } from "@/features/domains/client";
import { appBaseUrl } from "@/lib/links";

const ADMIN_PATHS = ["/admin", "/scan", "/login"];

export async function proxy(req: NextRequest) {
  // A host that can't be classified is the main app's: never let a config or parsing fault take
  // the whole app down. (A lookup error on an event address below is allowed to surface.)
  let host = "";
  let main = true;
  try {
    host = hostOf(req.headers.get("host"));
    main = isMainHost(host, domainConfig());
  } catch (err) {
    console.error("proxy: host classification failed, treating as main", err);
  }
  if (!main) return eventHost(req, host);
  const path = req.nextUrl.pathname;
  if (!ADMIN_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return NextResponse.next();
  return adminSession(req);
}

/** D425: an event's address answers only that event's attendee pages. */
async function eventHost(req: NextRequest, host: string) {
  const ev = await lookupHost(host);
  if (!ev) return new NextResponse("Not found", { status: 404 });
  const { pathname, search } = req.nextUrl;
  if (!ev.isPrimary && ev.primaryDomain) {
    const base = `${req.nextUrl.protocol}//${ev.primaryDomain}${req.nextUrl.port ? `:${req.nextUrl.port}` : ""}`;
    return NextResponse.redirect(redirectTarget(base, pathname, search), 308);
  }
  const route = routeEventPath(pathname, ev.slug);
  switch (route.kind) {
    case "rewrite": {
      const to = req.nextUrl.clone();
      to.pathname = route.path;
      return NextResponse.rewrite(to);
    }
    case "pass": return NextResponse.next();
    case "notFound": return new NextResponse("Not found", { status: 404 });
    case "main": return NextResponse.redirect(redirectTarget(appBaseUrl(), pathname, search), 308);
    default: {
      const exhaustive: never = route;
      throw new Error(`Unhandled route: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Unchanged from before D425: the admin session check on /admin, /scan and /login. */
async function adminSession(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (all, headers) => {
          all.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          all.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
          Object.entries(headers).forEach(([name, value]) => res.headers.set(name, value));
        },
      },
    },
  );
  // Verified locally against the project's JWKS (asymmetric signing keys), and still
  // refreshes an expired session - see requireAdmin for what getUser() would add.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;
  const path = req.nextUrl.pathname;
  const protectedPath = path.startsWith("/admin") || path.startsWith("/scan");
  if (protectedPath && !user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|icon.png|apple-icon.png).*)"],
};
