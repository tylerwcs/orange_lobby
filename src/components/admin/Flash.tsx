"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readFlash, stripFlash } from "@/lib/flash";
import { toast } from "@/lib/toast-store";

/**
 * Turns the flash a server action redirected with into a toast, then takes it out of the
 * address bar so a reload does not announce a save that happened a minute ago.
 *
 * Raising the toast from an effect is fine here because the store is not React state:
 * this is reporting an external change (the URL) to an external system, not a setState
 * cascade. The ref guards against the same flash being announced twice if the effect
 * re-runs before the replace lands.
 */
export function Flash() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const announced = useRef<string | null>(null);

  const flash = readFlash(params);
  const key = flash ? `${pathname}:${flash.tone}:${flash.message}` : null;

  useEffect(() => {
    if (!flash || !key || announced.current === key) return;
    announced.current = key;
    toast(flash.message, flash.tone);
    router.replace(`${pathname}${stripFlash(params.toString())}`, { scroll: false });
  }, [flash, key, params, pathname, router]);

  return null;
}
