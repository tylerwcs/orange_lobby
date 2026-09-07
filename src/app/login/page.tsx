import { signIn } from "./actions";
import { SubmitButton } from "@/components/admin/SubmitButton";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-6 text-2xl font-semibold">Orange Lobby</h1>
      {error && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <form action={signIn} className="space-y-4">
        <input type="hidden" name="next" value={next ?? "/admin"} />
        <input name="email" type="email" required placeholder="Email" className="w-full rounded border p-2" />
        <input name="password" type="password" required placeholder="Password" className="w-full rounded border p-2" />
        <SubmitButton className="w-full">Sign in</SubmitButton>
      </form>
    </main>
  );
}
