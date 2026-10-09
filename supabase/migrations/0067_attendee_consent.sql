-- When each attendee agreed to the Privacy Notice, and which version of it (D410).
--
-- PDPA's General and Notice & Choice principles want the data subject told, and their consent
-- had, at or before collection. Self-registration asks for it with a required tick; an attendee
-- who arrived any other way (the masterlist import, a walk-in at the door, an admin adding them)
-- is asked once, the first time they open their personal link. Either way the moment lands here.
--
-- consent_notice is the notice's "last updated" date as the page showed it, so a later change
-- to the policy can tell who agreed to which text. Both stay through a purge: once the name,
-- email and answers are gone they identify nobody, and they are the record that consent was had.
alter table attendees
  add column if not exists consented_at timestamptz,
  add column if not exists consent_notice text;
