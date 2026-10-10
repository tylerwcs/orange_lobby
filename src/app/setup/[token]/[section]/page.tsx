import { SetupStepPage } from "@/features/setup";

export const dynamic = "force-dynamic";

export default function Page(props: { params: Promise<{ token: string; section: string }> }) {
  return <SetupStepPage {...props} />;
}
