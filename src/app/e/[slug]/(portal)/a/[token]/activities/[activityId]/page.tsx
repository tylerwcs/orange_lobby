import type { Viewport } from "next";
import { ActivityPage } from "@/features/activities";

export const dynamic = "force-dynamic";
// A polaroid wall's full-screen camera pads itself by the safe areas (D482); env() needs this.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

/** One activity's own page in the portal (D178). The screens live in the activities feature (D419). */
export default ActivityPage;
