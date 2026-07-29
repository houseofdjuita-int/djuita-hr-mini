create extension if not exists pgcrypto;

create type public.app_role as enum ('Admin', 'Approver', 'Operator', 'Viewer');
create type public.request_status as enum ('Draft', 'Submitted', 'Approved', 'Rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._-]{4,40}$'),
  full_name text not null check (char_length(full_name) between 2 and 120),
  role public.app_role not null default 'Viewer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff (
  id text primary key,
  full_name text not null,
  position text not null,
  store text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  employee_id text references public.staff(id),
  employee_name text not null,
  employee_nik text not null check (employee_nik ~ '^\d{16}$'),
  letter_type text not null,
  start_date date not null,
  end_date date not null,
  shift text check (shift in ('Pagi', 'Siang') or shift is null),
  detail text not null,
  reason text not null,
  replacement_mode text check (replacement_mode in ('registered', 'external') or replacement_mode is null),
  replacement_name text,
  replacement_nik text check (replacement_nik ~ '^\d{16}$' or replacement_nik is null),
  attachment_paths jsonb not null default '[]'::jsonb,
  signature_path text,
  status public.request_status not null default 'Submitted',
  document_number text unique,
  approval_note text,
  rejection_note text,
  created_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  rejected_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  check (end_date >= start_date),
  check ((letter_type not in ('Pemberitahuan Cuti SPG','Izin Tidak Masuk (Full Shift)')) or (replacement_name is not null and replacement_nik is not null))
);

create table public.document_sequences (
  year integer not null,
  month integer not null check (month between 1 and 12),
  last_value integer not null default 0,
  primary key (year, month)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index requests_status_date_idx on public.requests(status, start_date desc);
create index requests_employee_date_idx on public.requests(employee_id, start_date desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger staff_touch before update on public.staff for each row execute function public.touch_updated_at();
create trigger requests_touch before update on public.requests for each row execute function public.touch_updated_at();

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.current_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and active = true $$;

create or replace function private.is_active()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and active = true) $$;

grant usage on schema private to authenticated;
grant execute on function private.current_role() to authenticated;
grant execute on function private.is_active() to authenticated;

alter table public.profiles enable row level security;
alter table public.staff enable row level security;
alter table public.requests enable row level security;
alter table public.document_sequences enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_read_self_or_admin on public.profiles for select to authenticated
using (id = auth.uid() or private.current_role() = 'Admin');

create policy staff_read_active_users on public.staff for select to authenticated
using (private.is_active());
create policy staff_manage_admin on public.staff for all to authenticated
using (private.current_role() = 'Admin') with check (private.current_role() = 'Admin');

create policy requests_read_active_users on public.requests for select to authenticated
using (private.is_active());
create policy requests_insert_admin_operator on public.requests for insert to authenticated
with check (private.current_role() in ('Admin','Operator') and created_by = auth.uid() and status in ('Draft','Submitted'));
create policy requests_update_own_unapproved on public.requests for update to authenticated
using (created_by = auth.uid() and private.current_role() in ('Admin','Operator') and status in ('Draft','Submitted'))
with check (created_by = auth.uid() and status in ('Draft','Submitted'));

create policy audit_read_admin on public.audit_logs for select to authenticated
using (private.current_role() = 'Admin');

grant select on public.profiles, public.staff, public.requests, public.audit_logs to authenticated;
grant insert, update on public.requests to authenticated;
grant insert, update, delete on public.staff to authenticated;

create or replace function public.approve_request(p_request_id uuid, p_note text default null, p_signature_path text default null)
returns public.requests
language plpgsql security definer set search_path = public
as $$
declare
  v_request public.requests;
  v_sequence integer;
  v_month integer;
  v_year integer;
  v_roman text;
begin
  if private.current_role() not in ('Admin','Approver') then raise exception 'Akses persetujuan ditolak'; end if;
  select * into v_request from public.requests where id = p_request_id for update;
  if not found or v_request.status <> 'Submitted' then raise exception 'Permohonan tidak dapat disetujui'; end if;
  if p_signature_path is null then raise exception 'Tanda tangan dan cap wajib diunggah'; end if;
  v_month := extract(month from now() at time zone 'Asia/Jakarta');
  v_year := extract(year from now() at time zone 'Asia/Jakarta');
  insert into public.document_sequences(year, month, last_value) values(v_year,v_month,1)
  on conflict(year,month) do update set last_value=public.document_sequences.last_value+1
  returning last_value into v_sequence;
  v_roman := (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[v_month];
  update public.requests set status='Approved', approval_note=nullif(trim(p_note),''), signature_path=p_signature_path,
    approved_by=auth.uid(), approved_at=now(), document_number=format('UMS/DJUITA/%s/%s/%s',lpad(v_sequence::text,3,'0'),v_roman,v_year)
  where id=p_request_id returning * into v_request;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'request.approved','request',p_request_id::text,jsonb_build_object('document_number',v_request.document_number));
  return v_request;
end $$;

create or replace function public.reject_request(p_request_id uuid, p_note text)
returns public.requests
language plpgsql security definer set search_path = public
as $$
declare v_request public.requests;
begin
  if private.current_role() not in ('Admin','Approver') then raise exception 'Akses persetujuan ditolak'; end if;
  if nullif(trim(p_note),'') is null then raise exception 'Alasan penolakan wajib diisi'; end if;
  update public.requests set status='Rejected', rejection_note=trim(p_note), rejected_by=auth.uid(), rejected_at=now()
  where id=p_request_id and status='Submitted' returning * into v_request;
  if not found then raise exception 'Permohonan tidak dapat ditolak'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'request.rejected','request',p_request_id::text);
  return v_request;
end $$;

grant execute on function public.approve_request(uuid,text,text) to authenticated;
grant execute on function public.reject_request(uuid,text) to authenticated;

insert into public.staff(id,full_name,position,store) values
('STF-002','Pudji','Staf Produksi','Kantor / Produksi'),
('STF-003','Minto','Staf Produksi','Kantor / Produksi'),
('STF-004','Nur','Staf Produksi','Kantor / Produksi'),
('STF-005','Yanti','Staf Produksi','Kantor / Produksi'),
('SPG-GL-01','Dwi','SPG','Galeries Lafayette Pacific Place'),
('SPG-MT-01','Ade Pertiwi (Tiwi)','SPG','Metro Plaza Senayan'),
('SPG-MT-02','Widiya Astiri (Widya)','SPG','Metro Plaza Senayan')
on conflict(id) do update set full_name=excluded.full_name,position=excluded.position,store=excluded.store,active=true;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('hr-private','hr-private',false,8388608,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=8388608,allowed_mime_types=excluded.allowed_mime_types;

create policy storage_read_authorized on storage.objects for select to authenticated
using (bucket_id='hr-private' and private.current_role() in ('Admin','Approver','Operator'));
create policy storage_insert_authorized on storage.objects for insert to authenticated
with check (bucket_id='hr-private' and private.current_role() in ('Admin','Approver','Operator') and (storage.foldername(name))[1]=auth.uid()::text);
create policy storage_delete_owner_or_admin on storage.objects for delete to authenticated
using (bucket_id='hr-private' and ((storage.foldername(name))[1]=auth.uid()::text or private.current_role()='Admin'));
