import { SetupReviewPage } from "@/features/setup";

export const metadata = { title: "Review setup" };

export default function Page(props: { params: Promise<{ id: string; section: string }> }) {
  return <SetupReviewPage {...props} />;
}
