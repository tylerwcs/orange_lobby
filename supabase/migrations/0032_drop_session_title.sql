-- A session is when an activity happens, not a thing with a name of its own.
--
-- `activity_sessions.title` was required, so organisers filled it with whatever came to hand:
-- InBody's 32 sessions were titled with their own date ("Mon 28 Sep"), and Health Screening's
-- "Morning" and "Afternoon" restated the start time. Everywhere a session was named, the
-- attendee read the activity's name or the date twice. The app now names a session by its day
-- and start time (`sessionLabel` in src/lib/activities.ts) and a booked session's agenda row by
-- its activity.
--
-- No function or view reads the column (checked against pg_proc and pg_views before this ran):
-- book_session, switch_session, cancel_booking and decide_request all work on ids, capacity and
-- categories. Dropped rather than left nullable so no form, import or export can start filling
-- it in again by accident.

alter table activity_sessions drop column title;
