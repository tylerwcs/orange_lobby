import { PortalShellSkeleton } from "@/components/portal/PortalShellSkeleton";

/**
 * The attendee portal: header, badge card, now card, tile grid — reserved so nothing jumps.
 *
 * This is an ancestor boundary of the personal routes too (`a/[token]/layout.tsx` is async),
 * so the shell it draws has to match `PortalChrome`'s. That geometry lives in
 * `PortalShellSkeleton` because the `/a/<token>` short link waits on the same shell.
 *
 * D709: it lives in the (portal) group so /register is not under it. Under a loading boundary
 * the page arrives as this skeleton plus hidden HTML that an inline script swaps in; a phone
 * whose browser does not run that script (old, locked down, script blocker) is left on the
 * skeleton - a blank page. The registration form is the one page a stranger opens cold, so it
 * is sent whole.
 *
 * D891: the personal pages under a/[token] have no loading.tsx of their own any more, so this
 * is only what a link opened cold shows. Between those pages the old one stays up, pressed,
 * until the next is ready (PageTransition, LinkPending).
 */
export default function PortalLoading() {
  return <PortalShellSkeleton />;
}
