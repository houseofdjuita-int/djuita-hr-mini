alter table public.profiles
  add column if not exists staff_id text references public.staff(id);

create unique index if not exists profiles_staff_id_unique
  on public.profiles(staff_id) where staff_id is not null;

create or replace function private.current_staff_id()
returns text language sql stable security definer set search_path=public as $$
  select staff_id from public.profiles where id=auth.uid() and active=true
$$;

drop policy if exists requests_read_active_users on public.requests;
drop policy if exists requests_insert_admin_operator on public.requests;
drop policy if exists requests_update_own_unapproved on public.requests;

create policy requests_read_by_role on public.requests for select to authenticated
using (
  private.is_active() and (
    private.current_role() in ('Admin','Approver','Operator','Viewer')
    or (private.current_role()='Employee' and (created_by=auth.uid() or employee_id=private.current_staff_id()))
  )
);

create policy requests_insert_authorized on public.requests for insert to authenticated
with check (
  created_by=auth.uid() and status in ('Draft','Submitted') and (
    private.current_role() in ('Admin','Operator')
    or (private.current_role()='Employee' and employee_id=private.current_staff_id())
  )
);

create policy requests_update_own_unapproved on public.requests for update to authenticated
using (
  created_by=auth.uid() and status in ('Draft','Submitted')
  and private.current_role() in ('Admin','Operator','Employee')
)
with check (
  created_by=auth.uid() and status in ('Draft','Submitted') and (
    private.current_role() in ('Admin','Operator')
    or (private.current_role()='Employee' and employee_id=private.current_staff_id())
  )
);

drop policy if exists storage_read_authorized on storage.objects;
drop policy if exists storage_insert_authorized on storage.objects;

create policy storage_read_authorized on storage.objects for select to authenticated
using (
  bucket_id='hr-private' and (
    private.current_role() in ('Admin','Approver','Operator')
    or (private.current_role()='Employee' and (storage.foldername(name))[1]=auth.uid()::text)
  )
);

create policy storage_insert_authorized on storage.objects for insert to authenticated
with check (
  bucket_id='hr-private'
  and private.current_role() in ('Admin','Operator','Employee')
  and (storage.foldername(name))[1]=auth.uid()::text
);
