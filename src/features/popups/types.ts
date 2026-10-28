/** The situation a popup shows in (D757). One today: the attendee hasn't done its activity. */
export type PopupTrigger = "not_done";

export type PortalPopup = {
  id: string;
  org_id: string;
  event_id: string;
  heading: string;
  message_html: string;
  button_label: string;
  trigger_kind: PopupTrigger;
  activity_id: string;
  is_on: boolean;
  sort_order: number;
  created_at: string;
};

/** What the portal needs to draw one; `message_html` is already sanitised. */
export type PopupShown = Pick<PortalPopup, "id" | "heading" | "message_html" | "button_label" | "activity_id">;

export type PopupInput = Pick<PortalPopup, "heading" | "message_html" | "button_label" | "activity_id">;
