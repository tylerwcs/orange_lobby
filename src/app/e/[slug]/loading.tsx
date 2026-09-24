import { PortalShellSkeleton } from "@/components/portal/PortalShellSkeleton";

/**
 * The attendee portal: header, badge card, now card, tile grid — reserved so nothing jumps.
 *
 * This is an ancestor boundary of the personal routes too (`a/[token]/layout.tsx` is async),
 * so the shell it draws has to match `PortalChrome`'s. That geometry lives in
 * `PortalShellSkeleton` because the `/a/<token>` short link waits on the same shell.
 */
export default function PortalLoading() {
  return <PortalShellSkeleton />;
}
