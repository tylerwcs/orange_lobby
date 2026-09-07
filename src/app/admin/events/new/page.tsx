import { createEventAction } from "../[id]/actions";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";

export default async function NewEvent({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <form action={createEventAction} className="max-w-md space-y-4 rounded border bg-white p-6">
      <h1 className="text-xl font-semibold">New event</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Field label="Name" name="name" />
      <Field label="Slug (URL)" name="slug" placeholder="auto from name" />
      <SubmitButton>Create</SubmitButton>
    </form>
  );
}
