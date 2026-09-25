"use client";
import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

/**
 * The top bar's link home. Elsewhere it simply goes home; on the home page itself it
 * refreshes it — the latest announcement, a booking the desk just moved, whether you are
 * checked in yet — and goes back to the top, which is what tapping it there is for.
 *
 * `router.refresh()` rather than a reload: it re-renders the page on the server with fresh
 * data while keeping whatever is open in the browser, and shows no blank page in between.
 */
export function HomeLink({ href, label, className, children }: {
  href: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  return (
    <Link
      href={href}
      aria-label={label}
      aria-busy={refreshing}
      className={`${className ?? ""} ${refreshing ? "opacity-60" : ""}`}
      onClick={(e) => {
        // New-tab and other modified clicks behave as a link always does.
        if (pathname !== href || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
        startRefresh(() => router.refresh());
      }}
    >
      {children}
    </Link>
  );
}
