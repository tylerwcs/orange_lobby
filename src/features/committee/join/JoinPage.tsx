import { TriangleAlert } from "lucide-react";
import { getEvent } from "@/lib/db/events";
import { allow } from "@/lib/ratelimit";
import { APP_NAME, APP_MARK } from "@/lib/app-name";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { linkIsLive, joinErrorCopy, MIN_PASSWORD } from "../lib/rules";
import { memberByToken, userIdByEmail, isOrgAdmin } from "../db";
import { joinAction } from "./actions";

const DEAD = "This link no longer works. Ask the Ecopia team for a new one.";
const BUSY = "Too many tries at once. Wait a minute and try again.";

/**
 * D559-D561: /join/<token>. A new login, an existing login, or a password reset, and one card
 * for every link that does not work. It never says why a link is dead.
 */
export async function JoinPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const busy = !allow(`join-page:${token}`, 60, 60_000);
  const m = busy ? null : await memberByToken(token);
  const ev = m ? await getEvent(m.event_id) : null;
  const existing = m ? await userIdByEmail(m.email) : null;
  const admin = existing !== null && await isOrgAdmin(existing);
  // A reset sets the password of `m.user_id`: it is dead unless that login is still the one this
  // email resolves to and is not an Ecopia admin. The action checks the same, so no form that loops.
  const resetOk = m?.link_kind !== "reset" || Boolean(m.user_id && existing === m.user_id && !await isOrgAdmin(m.user_id));
  const open = Boolean(m && ev && ev.status !== "archived" && linkIsLive(m, new Date()) && !admin && resetOk);
  const mode = !open ? null : m!.link_kind === "reset" ? "reset" : existing ? "existing" : "new";
  const problem = joinErrorCopy(error);

  const title = mode === "new" ? `Set up your ${APP_NAME} login`
    : mode === "existing" ? `You already have an ${APP_NAME} login — sign in to add ${ev!.name}.`
    : mode === "reset" ? "Choose a new password"
    : "Link not working";
  const description = mode === "new" ? `For ${ev!.name}. You'll sign in with this email from now on.`
    : mode === "existing" ? "Use the password you already sign in with."
    : mode === "reset" ? "It works for every event you're on."
    : busy ? BUSY : DEAD;
  const button = mode === "new" ? "Create my login" : mode === "existing" ? "Sign in and add this event" : "Save my new password";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm items-center bg-background p-6">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={APP_MARK} alt="" width={40} height={40} className="size-10 shrink-0" />
            <span className="text-xl font-extrabold">{APP_NAME}</span>
          </div>
          <CardTitle className="text-base font-extrabold">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {mode && (
          <CardContent className="flex flex-col gap-4">
            {problem && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>Not saved</AlertTitle>
                <AlertDescription>{problem}</AlertDescription>
              </Alert>
            )}
            <form action={joinAction.bind(null, token)} className="flex flex-col gap-4">
              <FieldGroup>
                {mode === "new" && (
                  <Field>
                    <FieldLabel htmlFor="name">Name</FieldLabel>
                    <Input id="name" value={m!.name} readOnly className="h-11" />
                  </Field>
                )}
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input id="email" type="email" value={m!.email} readOnly autoComplete="username" className="h-11" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">{mode === "existing" ? "Password" : "New password"}</FieldLabel>
                  <Input id="password" name="password" type="password" required
                    autoComplete={mode === "existing" ? "current-password" : "new-password"}
                    minLength={mode === "existing" ? undefined : MIN_PASSWORD} className="h-11" />
                </Field>
                {mode !== "existing" && (
                  <Field>
                    <FieldLabel htmlFor="confirm">Type it again</FieldLabel>
                    <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" minLength={MIN_PASSWORD} className="h-11" />
                  </Field>
                )}
              </FieldGroup>
              <SubmitButton className="h-11 w-full">{button}</SubmitButton>
            </form>
          </CardContent>
        )}
      </Card>
    </main>
  );
}
