-- The project disables automatic Data API grants. Netlify Functions use the
-- Supabase server role, so grant only the portal objects that backend needs.
grant usage on schema public, private to service_role;
grant select, insert, update, delete on table
  public.profiles,
  public.staff,
  public.requests,
  public.document_sequences,
  public.audit_logs
to service_role;
grant usage, select on all sequences in schema public to service_role;

grant execute on function private.current_role() to service_role;
grant execute on function private.is_active() to service_role;
grant execute on function private.current_staff_id() to service_role;
grant execute on function public.approve_request(uuid, text, text) to service_role;
grant execute on function public.reject_request(uuid, text) to service_role;
grant execute on function public.review_request(uuid, text, text) to service_role;
