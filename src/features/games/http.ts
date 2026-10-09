/** A JSON response no cache may keep: every game endpoint answers "right now". */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
