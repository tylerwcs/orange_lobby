insert into organisations (name, slug) values ('Ecopia Events', 'ecopia')
on conflict (slug) do nothing;
-- After creating the first user in Supabase Auth > Users (email + password, auto-confirm):
-- insert into org_members (org_id, user_id)
-- select id, '<USER_UUID>' from organisations where slug = 'ecopia';
