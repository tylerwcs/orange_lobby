import { TriangleAlert } from "lucide-react";
import { signIn } from "./actions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { loginErrorCopy } from "@/lib/login-errors";
import { APP_NAME, APP_MARK } from "@/lib/app-name";

/**
 * The only door into the admin.
 *
 * The mark is the one on the sidebar, in the same colour, because this is the screen that
 * hands you over to it — and because a wrong-looking mark is the first thing that should
 * make someone doubt a page asking for their password.
 *
 * There is no "create an account" and no "forgot password": D18 says accounts are made by
 * an admin and there is no self sign-up. The description says so rather than leaving a new
 * starter hunting for a link that was never there.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const copy = loginErrorCopy(error);
  // `w-full` on the main below is load-bearing, not decoration. The root layout's body is
  // `flex flex-col`, so this main is a flex item, and `mx-auto` in the cross axis cancels the
  // default stretch — leaving the element to size to its content. Without it the card collapsed
  // to about 150px and the wordmark wrapped mid-word.
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm items-center bg-background p-6">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={APP_MARK} alt="" width={40} height={40} className="size-10 shrink-0" />
            <span className="text-xl font-extrabold">{APP_NAME}</span>
          </div>
          <CardTitle className="text-base font-extrabold">Sign in</CardTitle>
          <CardDescription>Accounts are created by an administrator. If you do not have one, ask the team.</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {/*
            An Alert rather than a tinted div: the old one used bg-red-50/text-red-700, two
            colours that exist nowhere in globals.css and so were never contrast-checked
            against this card the way every token pair in tests/contrast.test.ts is.

            The words come from `loginErrorCopy`, not from the query string. `?error=` now
            carries a code, so a crafted link can pick one of five sentences this app wrote
            and cannot write a sixth of its own.
          */}
          {copy && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>{copy.title}</AlertTitle>
              <AlertDescription>{copy.description}</AlertDescription>
            </Alert>
          )}

          <form action={signIn} className="flex flex-col gap-4">
            <input type="hidden" name="next" value={next ?? "/admin"} />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                {/*
                  h-11 rather than the Input's own h-8: crew sign in on a phone at a venue,
                  and 44px is the floor every touch target in this app is held to.
                */}
                <Input id="email" name="email" type="email" required autoComplete="email" inputMode="email" className="h-11" />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input id="password" name="password" type="password" required autoComplete="current-password" className="h-11" />
              </Field>
            </FieldGroup>
            <SubmitButton className="h-11 w-full">Sign in</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
