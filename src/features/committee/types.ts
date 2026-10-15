/** D558: one row of `event_committee`. */
export type CommitteeMember = {
  id: string;
  event_id: string;
  name: string;
  /** Lower-cased and trimmed (the column's check constraint enforces it). */
  email: string;
  /** Null until the set-up link is used. */
  user_id: string | null;
  added_by: string | null;
  added_at: string;
  accepted_at: string | null;
  /** Set by Remove; the row is kept. */
  removed_at: string | null;
  /** The one live link, or null. A new link overwrites it (D558). */
  link_token: string | null;
  link_kind: "setup" | "reset" | null;
  link_expires_at: string | null;
};
