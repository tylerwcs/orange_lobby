import { JoinPage } from "@/features/committee";

export const dynamic = "force-dynamic";
// A join link is an authority, not a page: keep it out of search indexes like every token route.
export const metadata = { title: "Join", robots: { index: false, follow: false } };

export default function Page(props: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  return <JoinPage {...props} />;
}
