import { SetupHomePage } from "@/features/setup";

export const dynamic = "force-dynamic";

export default function Page(props: { params: Promise<{ token: string }> }) {
  return <SetupHomePage {...props} />;
}
