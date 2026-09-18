import { loadPortalAttendee } from "@/lib/portal";
import { PortalChrome } from "@/components/portal/PortalChrome";

/**
 * The personal portal's chrome lives here rather than in each page, so the header and the
 * bottom bar are rendered once and stay put. A page below only renders its own body; tapping
 * a nav item swaps that body and leaves the bar it was tapped on alone.
 *
 * `loadPortalAttendee` is memoised per request, so this costs nothing that the page below was
 * not already paying (D118).
 */
export default async function PersonalLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const { event } = await loadPortalAttendee(slug, token);
  const chromeEvent = {
    name: event.name,
    logo_url: event.logo_url,
    starts_on: event.starts_on,
    ends_on: event.ends_on,
    venue_name: event.venue_name,
    status: event.status,
    primary_color: event.primary_color,
    banner_url: event.banner_url,
    info_page_html: event.info_page_html,
  };
  return (
    <PortalChrome event={chromeEvent} basePath={`/e/${slug}/a/${token}`} personal>
      {children}
    </PortalChrome>
  );
}
