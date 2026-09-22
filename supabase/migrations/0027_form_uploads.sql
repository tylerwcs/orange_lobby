-- Attendee-submitted files, in a bucket of their own — PRIVATE, unlike event-media (D168).
--
-- event-media is public on purpose: a logo and a floor plan are public by nature and render
-- in plain <img> tags on a portal anyone with a link can open. A photograph or a receipt an
-- attendee uploaded is not that, and "nobody will guess the filename" is not access control.
-- Reads go through short-lived signed URLs instead.
--
-- No policies, as everywhere else: uploads travel through a Server Action using the service
-- role, so the anon key can never write here and never read here either.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'form-uploads', 'form-uploads', false,
  10485760, -- 10 MB, the same cap src/lib/storage.ts enforces before the upload starts
  array['image/png','image/jpeg','image/jpg','image/webp','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
