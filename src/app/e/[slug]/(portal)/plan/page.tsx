import { redirect } from "next/navigation";

/** The floor plan is an Info tab now (D839): an old tile or link lands on the Info page. */
export default async function OldFloorPlan({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/e/${encodeURIComponent(slug)}/info`);
}
