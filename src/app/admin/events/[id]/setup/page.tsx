import { SetupAdminPage } from "@/features/setup";

export const metadata = { title: "Setup" };

export default function Page(props: { params: Promise<{ id: string }> }) {
  return <SetupAdminPage {...props} />;
}
