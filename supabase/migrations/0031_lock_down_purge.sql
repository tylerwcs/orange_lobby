-- purge_event_personal_data was callable with the anon key. Closing that.
--
-- Supabase provisions every project with `alter default privileges in schema public grant
-- execute on functions to anon, authenticated, service_role`, which fires at CREATE FUNCTION
-- time. 0017 learned this and every rpc added since has carried an explicit revoke — except
-- this one, which was written in 0024 as a fix to an existing TypeScript function and never
-- got the treatment its siblings did.
--
-- The consequence was not theoretical. The anon key ships in the client bundle, the function
-- takes only an event id and an array of strings the caller chooses, and what it does is
-- irreversibly replace every attendee's name, email, seat and answers and reissue every
-- personal link. Anyone holding that key could have wiped an event.
--
-- Found by checking has_function_privilege across every function while renaming submit_form,
-- which is the argument for checking the whole list rather than the one being edited: this
-- was invisible from the diff that introduced it.
revoke execute on function purge_event_personal_data(uuid, text[]) from public, anon, authenticated;
grant execute on function purge_event_personal_data(uuid, text[]) to service_role;
