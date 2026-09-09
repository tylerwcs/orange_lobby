import { signIn } from "./actions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Card } from "@/components/ui/Card";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm items-center bg-canvas p-6">
      <Card className="w-full p-6">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand text-sm font-extrabold text-ink">OL</span>
          <span className="text-xl font-extrabold">Orange Lobby</span>
        </div>
        {error && <p className="mb-4 rounded-[var(--radius-control)] bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <form action={signIn} className="space-y-4">
          <input type="hidden" name="next" value={next ?? "/admin"} />
          <label className="block text-sm"><span className="mb-1 block font-bold">Email</span><input name="email" type="email" required autoComplete="email" inputMode="email" className="w-full min-h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-sm" /></label>
          <label className="block text-sm"><span className="mb-1 block font-bold">Password</span><input name="password" type="password" required autoComplete="current-password" className="w-full min-h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-sm" /></label>
          <SubmitButton className="w-full">Sign in</SubmitButton>
        </form>
      </Card>
    </main>
  );
}
