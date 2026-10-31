import { requireOrgAdmin } from "@/lib/access";
import { FeaturesPage } from "@/features/catalogue";

export const metadata = { title: "Features" };

/** Ecopia's own (D780): the registry across every event. A committee member is refused by requireOrgAdmin. */
export default async function Features() {
  const { orgId } = await requireOrgAdmin();
  return <FeaturesPage orgId={orgId} />;
}
