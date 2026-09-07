import type { Event } from "@/lib/types";

export function EventInfoCard({ event, greeting }: { event: Event; greeting?: string }) {
  return (
    <div className="space-y-3">
      {greeting && <p className="text-lg">Hi {greeting} 👋</p>}
      <h1 className="text-2xl font-semibold">{event.name}</h1>
      {(event.starts_on || event.ends_on) && <p className="text-sm text-gray-600">{event.starts_on}{event.ends_on && event.ends_on !== event.starts_on ? ` – ${event.ends_on}` : ""}</p>}
      {event.venue_name && <div className="rounded-lg border p-3 text-sm"><div className="font-medium">{event.venue_name}</div>{event.venue_address && <div className="text-gray-600">{event.venue_address}</div>}
        {event.venue_map_url && <a className="text-[var(--brand)] underline" href={event.venue_map_url}>Open map</a>}</div>}
      {event.description && <p className="whitespace-pre-line text-sm text-gray-700">{event.description}</p>}
      {event.contact_name && <p className="text-sm text-gray-600">Contact: {event.contact_name}{event.contact_phone && <> · <a className="underline" href={`tel:${event.contact_phone}`}>{event.contact_phone}</a></>}</p>}
    </div>
  );
}
