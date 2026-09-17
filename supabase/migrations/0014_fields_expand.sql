-- Expand step: company, phone and table_no become ordinary event fields.
--
-- Additive on purpose: the columns and events.collected_fields both stay, so this SQL is
-- safe to apply at any time and safe to re-run. That does not make *when* to apply it a free
-- choice — see docs/runbook.md, "Attendee fields: expand (migration 0014)", for the deploy
-- ordering this depends on before it is safe to run against a live event.
-- A later migration drops the columns, once the queries in the runbook come back zero.

-- 1. Field definitions. company and phone become registration questions, because that is
--    what the public form asked for them until now; table_no becomes an attendee column,
--    because it is assigned after seating and imported, never asked at sign-up.
update events set registration_questions = registration_questions ||
  jsonb_build_object('key','company','label','Company','type','text','required',false)
where 'company' = any(collected_fields)
  and not registration_questions @> '[{"key":"company"}]'::jsonb
  and not attendee_fields        @> '[{"key":"company"}]'::jsonb;

update events set registration_questions = registration_questions ||
  jsonb_build_object('key','phone','label','Mobile','type','phone','required',false)
where 'phone' = any(collected_fields)
  and not registration_questions @> '[{"key":"phone"}]'::jsonb
  and not attendee_fields        @> '[{"key":"phone"}]'::jsonb;

update events set attendee_fields = attendee_fields ||
  jsonb_build_object('key','table_no','label','Table','type','text')
where 'table_no' = any(collected_fields)
  and not registration_questions @> '[{"key":"table_no"}]'::jsonb
  and not attendee_fields        @> '[{"key":"table_no"}]'::jsonb;

-- 2. The values. `|| extra` last means an existing extra key always wins over the column.
--    Each column is wrapped in nullif(col, '') because jsonb_strip_nulls only drops a real
--    null, not an empty string — and fieldValue() treats a present key as authoritative, so
--    an unwrapped '' would permanently shadow the column instead of falling through to it.
--    0006_pinned_fields.sql set the precedent: `table_no is not null and table_no <> ''`.
update attendees set extra = jsonb_strip_nulls(jsonb_build_object(
    'company', nullif(company, ''), 'phone', nullif(phone, ''), 'table_no', nullif(table_no, ''))) || extra
where company is not null or phone is not null or table_no is not null;

-- 3. The scan card showed Company, Category and Table by name. Category still shows; the
--    other two are fields now, so seed them as this event's chosen scan fields — otherwise
--    crew lose two lines they have been reading all along. `order by k` makes the result
--    deterministic ({company,table_no}): array_agg without one is not guaranteed, and order
--    decides which line the crew read first on the scan card.
update events set scan_extra_fields = (
  select array_agg(k order by k) from (
    select unnest(array['company','table_no']) as k
  ) legacy where k = any(collected_fields)
) || scan_extra_fields
where scan_extra_fields = '{}' and collected_fields && array['company','table_no'];
