import { PendingScope, PendingSwap } from "@/components/PendingNav";
import CrewLoading from "./loading";

/** The crew scanner's door changes are query-only too; see the admin scanner's layout. */
export default function CrewLayout({ children }: { children: React.ReactNode }) {
  return (
    <PendingScope>
      <PendingSwap fallback={<CrewLoading />}>{children}</PendingSwap>
    </PendingScope>
  );
}
