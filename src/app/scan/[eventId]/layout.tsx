import { PendingScope, PendingSwap } from "@/components/PendingNav";
import ScanLoading from "./loading";

/**
 * Choosing a door and going back to the door list only change `?cp=` and `?pick=`, so the
 * route's loading.tsx never fires for them. The scope swaps the page for the scanner's own
 * skeleton while the next view loads - and unmounting the scanner at once stops the camera
 * the moment somebody leaves it, instead of when the new page lands.
 */
export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return (
    <PendingScope>
      <PendingSwap fallback={<ScanLoading />}>{children}</PendingSwap>
    </PendingScope>
  );
}
