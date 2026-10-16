# Coming soon message — design

Date: 16 Oct 2026. Decision D617. Migration 0089.

**D617 — The organiser writes the Coming soon message.** While an event is a draft, every portal
link shows the event card with `Coming soon. Check back closer to the event.` Settings → Details →
Event gains a `Coming soon message` box (textarea, placeholder = the default) saved with
**Save settings**. Blank uses the default. Line breaks are kept. No `{name}`: the public portal
link has no attendee. Stored in `events.coming_soon_message text` (null = default). The cancel
link (D585) still sits under it. Admins and committee alike, like the rest of the Details tab.
