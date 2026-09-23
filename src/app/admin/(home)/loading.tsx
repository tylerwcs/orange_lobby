import AdminEventLoading from "../events/[id]/loading";

/**
 * `/admin` only works out which event to open and redirects there, so the placeholder is
 * that event's Overview - what the organiser is about to see. In a group of its own so it
 * covers this page and nothing under `/admin/events`.
 */
export default function AdminHomeLoading() {
  return (
    <div className="min-w-0 flex-1 p-4 pt-6 lg:p-6 lg:pt-8 2xl:p-8">
      <AdminEventLoading />
    </div>
  );
}
