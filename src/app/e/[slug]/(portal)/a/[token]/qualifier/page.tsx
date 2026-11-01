import { redirect } from "next/navigation";

/** Slime Splat moved to the Games page (D797): an old tile or link lands there. */
export default async function OldSlimeSplat({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  redirect(`/e/${encodeURIComponent(slug)}/a/${encodeURIComponent(token)}/play`);
}
