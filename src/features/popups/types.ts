/** The situation a popup shows in (D757). One today: the attendee hasn't done its activity. */
export type PopupTrigger = "not_done";

export type PortalPopup = {
  id: string;
  org_id: string;
  event_id: string;
  heading: string;
  message_html: string;
  button_label: string;
  /** D808: an optional picture above the heading, shown whole. */
  image_url: string | null;
  trigger_kind: PopupTrigger;
  activity_id: string;
  is_on: boolean;
  sort_order: number;
  created_at: string;
};

/** What the portal needs to draw one; `message_html` is already sanitised. */
export type PopupShown = Pick<PortalPopup, "id" | "heading" | "message_html" | "button_label" | "activity_id" | "image_url">;

export type PopupInput = Pick<PortalPopup, "heading" | "message_html" | "button_label" | "activity_id">;
/** What a save writes: the form, and the picture `nextImage` settled on. */
export type PopupWrite = PopupInput & Pick<PortalPopup, "image_url">;
