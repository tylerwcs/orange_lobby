import type { Metadata } from "next";
import { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Flash } from "@/components/admin/Flash";

// A verifier link is an authority, not a page: keep it out of search indexes, as every
// token-carrying route in this app is.
export const metadata: Metadata = { title: "Verify submissions", robots: { index: false, follow: false } };

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}><Flash /></Suspense>
      <Toaster />
    </>
  );
}
