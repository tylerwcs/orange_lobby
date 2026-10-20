"use client";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { stripFlash } from "@/lib/flash";

/** Where a form was sent from and how far down the page was, until the action lands. */
let sent: { at: string; y: number } | null = null;

/**
 * D713: keeps the page where it was after a form on it saves. A server action lands back with a
 * redirect to the same tab plus `?flash=…`; that is a new address to the router, so Next scrolls
 * to the top, which loses your place halfway down a list of matches.
 *
 * Remembers the scroll on submit, and puts it back when the router lands on the same address
 * with a flash. In an effect, which runs after the router's own scroll in the same commit, and
 * once more on the next frame in case the page painted in two passes. A landing anywhere else
 * (another tab, another page) just forgets it.
 */
export function KeepScroll() {
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  const at = `${pathname}${stripFlash(search)}`;
  const here = useRef(at);
  useEffect(() => { here.current = at; }, [at]);

  useEffect(() => {
    const remember = () => { sent = { at: here.current, y: window.scrollY }; };
    document.addEventListener("submit", remember, true);
    return () => document.removeEventListener("submit", remember, true);
  }, []);

  useEffect(() => {
    if (!sent || !new URLSearchParams(search).has("flash")) return;
    const { at: from, y } = sent;
    sent = null;
    if (from !== at) return;
    window.scrollTo(0, y);
    requestAnimationFrame(() => window.scrollTo(0, y));
  }, [at, search]);

  return null;
}
