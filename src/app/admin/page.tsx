import { requireAdmin } from "@/lib/auth";
export default async function AdminHome() {
  const ctx = await requireAdmin();
  return <p className="p-6">Signed in as {ctx.email}</p>;
}
