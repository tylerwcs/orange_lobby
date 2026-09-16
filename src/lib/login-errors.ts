/**
 * Why sign-in failed, as a code this app owns rather than a message Supabase wrote.
 *
 * The old login page put `error.message` into the query string and rendered whatever came
 * back. React escapes it, so there was no injection — but anyone could send a colleague
 * `/login?error=Your%20account%20is%20locked,%20call%20+60...` and the real login page would
 * render that sentence, styled, on the one screen in the product that asks for a password.
 *
 * A code cannot carry a sentence. Anything unrecognised — including a crafted one — falls
 * through to `unknown`, whose copy is written here.
 */
export const LOGIN_ERRORS = ["invalid", "unconfirmed", "rate", "disabled", "unknown"] as const;
export type LoginErrorCode = (typeof LOGIN_ERRORS)[number];

const COPY: Record<LoginErrorCode, { title: string; description: string }> = {
  invalid: {
    title: "Could not sign you in",
    description: "Check the email and password and try again.",
  },
  unconfirmed: {
    title: "This account is not confirmed yet",
    description: "Ask whoever created it to confirm the address, then try again.",
  },
  rate: {
    title: "Too many attempts",
    description: "Wait a minute, then try again.",
  },
  disabled: {
    title: "Password sign-in is turned off",
    description: "This is a setting on the project, not on your account. Ask the team.",
  },
  unknown: {
    title: "Could not sign you in",
    description: "Something went wrong at our end. Try again, and tell the team if it keeps happening.",
  },
};

/**
 * Classifies the error Supabase returned.
 *
 * Matched on the message because that is what `signInWithPassword` gives us — there is no
 * stable code on the error for these cases. An unmatched message is `unknown` rather than
 * being passed along: the point of this function is that nothing Supabase writes reaches the
 * screen verbatim.
 */
export function classifyLoginError(message: string): LoginErrorCode {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "invalid";
  if (m.includes("not confirmed")) return "unconfirmed";
  if (m.includes("rate limit") || m.includes("too many")) return "rate";
  if (m.includes("logins are disabled") || m.includes("signups not allowed")) return "disabled";
  return "unknown";
}

function isLoginErrorCode(value: string): value is LoginErrorCode {
  return (LOGIN_ERRORS as readonly string[]).includes(value);
}

/**
 * The words to show for whatever arrived in `?error=`. A value this app never issues gets
 * the `unknown` copy, so a hand-written query string can change which of five sentences
 * appears and nothing else.
 */
export function loginErrorCopy(raw: string | undefined): { title: string; description: string } | null {
  if (!raw) return null;
  return COPY[isLoginErrorCode(raw) ? raw : "unknown"];
}
