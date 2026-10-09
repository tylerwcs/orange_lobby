import Link from "next/link";
import { APP_NAME } from "@/lib/app-name";
import { PRIVACY_MS_PATH, PRIVACY_PATH } from "@/lib/privacy";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

const VERSIONS = [
  { lang: "en", label: "English", href: PRIVACY_PATH },
  { lang: "ms", label: "Bahasa Malaysia", href: PRIVACY_MS_PATH },
] as const;

/**
 * The Privacy Notice's frame, shared by its English (/privacy) and Bahasa Malaysia
 * (/privacy/ms) texts (D411). PDPA s7(3) wants the notice in both languages, so each version
 * links to the other at the top, where a reader looks for it, and the two cannot drift apart
 * in layout while their wording is kept side by side.
 *
 * `lang` marks the whole text, so a screen reader reads the Malay version in Malay; the root
 * layout's <html lang> stays English for the rest of the app.
 */
export function PrivacyShell({ lang, title, updated, back, children }: {
  lang: "en" | "ms";
  title: string;
  /** "Last updated 24 September 2026", in the page's language. */
  updated: string;
  /** "Back to ECP Hub", in the page's language. */
  back: string;
  children: React.ReactNode;
}) {
  return (
    <main lang={lang} className="mx-auto w-full max-w-2xl px-5 py-12 md:py-16">
      <header className="space-y-2 border-b pb-6">
        <nav aria-label="Language" className="flex gap-1 text-sm">
          {VERSIONS.map((v) => v.lang === lang
            ? <span key={v.lang} aria-current="page" className="rounded-md bg-accent px-2.5 py-1 font-bold text-primary">{v.label}</span>
            : <Link key={v.lang} href={v.href} lang={v.lang} hrefLang={v.lang} className="rounded-md px-2.5 py-1 font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">{v.label}</Link>)}
        </nav>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{APP_NAME} · {updated}</p>
      </header>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground/90">
        {children}
      </div>

      <footer className="mt-12 border-t pt-6 text-sm">
        <Link href="/" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
          {back}
        </Link>
      </footer>
    </main>
  );
}
