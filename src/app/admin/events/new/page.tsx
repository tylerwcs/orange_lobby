import { createEventAction } from "../[id]/actions";
import { requireAdmin } from "@/lib/auth";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Sidebar } from "@/components/admin/Sidebar";
import { Card } from "@/components/ui/Card";

export default async function NewEvent({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { email } = await requireAdmin();
  return (
    <>
      <Sidebar email={email} />
      <main className="flex-1 p-6">
        <Card className="max-w-md p-6">
          <form action={createEventAction} className="space-y-4">
            <h1 className="text-xl font-extrabold">New event</h1>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Field label="Name" name="name" />
            <Field label="Slug (URL)" name="slug" placeholder="auto from name" />
            <SubmitButton>Create</SubmitButton>
          </form>
        </Card>
      </main>
    </>
  );
}
