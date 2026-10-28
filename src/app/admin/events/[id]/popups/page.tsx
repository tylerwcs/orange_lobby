import { PopupsPage } from "@/features/popups";

export const metadata = { title: "Popups" };

export default async function PopupsAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PopupsPage eventId={id} />;
}
