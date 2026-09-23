"use client";

import { createContext, useContext, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";

/**
 * Feedback for navigations that `loading.tsx` cannot see.
 *
 * Next swaps in a route's skeleton when a link leads to a different page. A link that only
 * changes the query string - a day tab, Next page, a checkpoint - stays on the same page, so
 * no boundary fires and the old content just sits there until the new render lands. On a
 * phone that reads as a tap that did not register.
 *
 * A `PendingScope` runs those navigations as a transition it can see. Inside it,
 * `PendingLink` starts one and moves its own "selected" look at once; `PendingSwap` puts up
 * a skeleton in place of the content while it runs. Anything outside the swap - the tabs
 * themselves - stays put, so the reader sees which tab they chose while it loads.
 *
 * The links are still real `<a href>`s: a modified click (new tab, new window) and a page
 * without JavaScript both fall through to the browser as ordinary links.
 */
type Scope = { go: (href: string) => void; pending: boolean; target: string | null };

const ScopeContext = createContext<Scope | null>(null);

export function PendingScope({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<string | null>(null);
  const go = (href: string) => {
    setTarget(href);
    start(() => router.push(href, { scroll: false }));
  };
  return <ScopeContext.Provider value={{ go, pending, target }}>{children}</ScopeContext.Provider>;
}

/** The content a scoped navigation replaces. Outside a scope it is only its children. */
export function PendingSwap({ fallback, children }: { fallback: React.ReactNode; children: React.ReactNode }) {
  const scope = useContext(ScopeContext);
  return <>{scope?.pending ? fallback : children}</>;
}

const modified = (e: React.MouseEvent) => e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;

/**
 * A link that shows it was pressed.
 *
 * Inside a `PendingScope` it drives that scope. Outside one it runs its own transition and
 * shows a spinner at its leading edge instead - for a lone control such as the booths' QR
 * button, where there is no region to swap but the press still has to answer.
 *
 * `selected` and the two class names are for tabs: while a navigation is on its way, the link
 * being navigated to looks selected and its siblings do not, ahead of the server's answer.
 */
export function PendingLink({ href, className = "", selected, selectedClassName = "", unselectedClassName = "", children, ...rest }: {
  href: string;
  className?: string;
  selected?: boolean;
  selectedClassName?: string;
  unselectedClassName?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children" | "onClick">) {
  const scope = useContext(ScopeContext);
  const router = useRouter();
  const [ownPending, start] = useTransition();
  const pending = scope ? scope.pending && scope.target === href : ownPending;
  const looksSelected = scope?.pending ? scope.target === href : selected;
  return (
    <Link
      href={href}
      {...rest}
      aria-busy={pending || undefined}
      aria-current={selected !== undefined && looksSelected ? "page" : undefined}
      className={`${className} ${looksSelected ? selectedClassName : unselectedClassName}`}
      onClick={(e) => {
        if (modified(e)) return;
        e.preventDefault();
        if (scope) scope.go(href);
        else start(() => router.push(href, { scroll: false }));
      }}
    >
      {!scope && ownPending && <Spinner data-icon="inline-start" />}
      {children}
    </Link>
  );
}
