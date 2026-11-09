-- Security-definer functions must never inherit PostgreSQL's default PUBLIC
-- execute grant. Only signed-in portal users may invoke them; the functions
-- still enforce the caller's application role internally.
revoke all on function private.current_role() from public, anon;
revoke all on function private.is_active() from public, anon;
revoke all on function private.current_staff_id() from public, anon;
revoke all on function public.approve_request(uuid, text, text) from public, anon;
revoke all on function public.reject_request(uuid, text) from public, anon;
revoke all on function public.review_request(uuid, text, text) from public, anon;

grant execute on function private.current_role() to authenticated;
grant execute on function private.is_active() to authenticated;
grant execute on function private.current_staff_id() to authenticated;
grant execute on function public.approve_request(uuid, text, text) to authenticated;
grant execute on function public.reject_request(uuid, text) to authenticated;
grant execute on function public.review_request(uuid, text, text) to authenticated;

-- Storage upsert requires SELECT, INSERT, and UPDATE. Restrict replacement of
-- an uploaded file to the signed-in user's own top-level folder.
drop policy if exists storage_update_owner on storage.objects;
create policy storage_update_owner on storage.objects
for update to authenticated
using (
  bucket_id = 'hr-private'
  and private.current_role() in ('Admin', 'Operator', 'Employee')
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'hr-private'
  and private.current_role() in ('Admin', 'Operator', 'Employee')
  and (storage.foldername(name))[1] = auth.uid()::text
);
