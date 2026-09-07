import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(req: NextRequest) {
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
  const { data: { user } } = await supabase.auth.getUser();
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

export const config = { matcher: ["/admin/:path*", "/scan/:path*", "/login"] };
