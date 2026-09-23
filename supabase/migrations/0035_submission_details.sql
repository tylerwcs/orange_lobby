-- When and where a submission activity happens, and what its button says.
--
-- A booking activity's dates and place come from its sessions; a submission activity has no
-- sessions, so an organiser running a challenge from 28 Sep to 2 Oct at the gym had nowhere to
-- say so. starts_on/ends_on are dates (ends_on optional, a single day otherwise), venue is free
-- text, both shown on the card and the page the way a booking's are.
--
-- action_label is the attendee's button - "Submit" when null, which is what every existing
-- activity keeps. All four nullable, so nothing existing changes.

alter table activities
  add column starts_on date,
  add column ends_on date,
  add column venue text,
  add column action_label text;
