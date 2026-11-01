import * as FLAGS from "country-flag-icons/string/3x2";

/**
 * D800: one country's flag for the phone field's picker, as `/flags/MY.svg`. Served one at a
 * time rather than bundled: the whole set is about 900 KB, and a form shows one flag until its
 * list is opened. The images never change, so a browser keeps each one for good.
 */
const BY_CODE = FLAGS as unknown as Record<string, string>;

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const m = /^([A-Z]{2})\.svg$/.exec(code);
  const svg = m ? BY_CODE[m[1]] : undefined;
  if (!svg) return new Response("Not found", { status: 404 });
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
