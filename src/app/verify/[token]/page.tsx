import { VerifyPage } from "@/features/activities";

// Never cached: a removed link must stop on the next load (D496), and the list is live.
export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const raw = await searchParams;
  const search = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return <VerifyPage token={token} search={search} />;
}
