-- ─────────────────────────────────────────────────────────────────────────────
-- Resume Feed — Supabase Storage setup
--
-- Run once, as a whole, in the Supabase Dashboard → SQL Editor.
-- Re-running is safe: bucket rows upsert and every policy is dropped first.
--
-- Two buckets, deliberately different:
--
--   avatars  public  — profile pictures. Shown on every feed card, so a signed
--                      URL per render would be wasteful. The URL is public but
--                      unguessable enough, and a profile picture is not PII the
--                      way a resume is.
--   resumes  private — resume PDFs. These carry names, phone numbers and
--                      employers. Reads go through a signed URL issued by the
--                      Express API, which is where "may this person see this
--                      resume?" is decided.
--
-- Ownership in both buckets is the first path segment: `<user_id>/<filename>`.
-- The policies below are the only thing enforcing that, so keep uploads writing
-- to that shape.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Buckets ──────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MiB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  5242880, -- 5 MiB
  array['application/pdf']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── avatars ──────────────────────────────────────────────────────────────────

drop policy if exists "avatars_public_read"   on storage.objects;
drop policy if exists "avatars_owner_insert"  on storage.objects;
drop policy if exists "avatars_owner_update"  on storage.objects;
drop policy if exists "avatars_owner_delete"  on storage.objects;

-- The bucket's `public` flag already opens the /object/public/ endpoint; this
-- policy is what additionally lets the SDK list and read through the API.
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- `upsert: true` on an existing object is an UPDATE, so replacing a picture
-- needs this as well as the insert policy above.
create policy "avatars_owner_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "avatars_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- ── resumes ──────────────────────────────────────────────────────────────────
-- No public read policy on purpose. Other people's resumes are reachable only
-- through a signed URL, which the service-role key mints server-side (service
-- role bypasses RLS, so none of these policies apply to the Express API).

drop policy if exists "resumes_owner_read"   on storage.objects;
drop policy if exists "resumes_owner_insert" on storage.objects;
drop policy if exists "resumes_owner_update" on storage.objects;
drop policy if exists "resumes_owner_delete" on storage.objects;

create policy "resumes_owner_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "resumes_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "resumes_owner_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "resumes_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- ── Verify ───────────────────────────────────────────────────────────────────

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('avatars', 'resumes');

select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like any (array['avatars_%', 'resumes_%'])
order by policyname;
