alter table public.requests
  add column if not exists revision_note text,
  add column if not exists cancellation_note text,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz;

do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
  where conrelid='public.requests'::regclass and contype='c'
    and pg_get_constraintdef(oid) ilike '%letter_type%replacement_name%';
  if v_name is not null then execute format('alter table public.requests drop constraint %I',v_name); end if;
end $$;

alter table public.requests add constraint requests_replacement_required_check check (
  letter_type not in ('Pemberitahuan Cuti SPG','Pemberitahuan Libur / Off SPG','Izin Tidak Masuk (Full Shift)')
  or (replacement_name is not null and replacement_nik is not null)
);

create or replace function public.review_request(p_request_id uuid,p_action text,p_note text)
returns public.requests language plpgsql security definer set search_path=public,private as $$
declare v_request public.requests;
begin
  if private.current_role() not in ('Admin','Approver') then raise exception 'Akses persetujuan ditolak'; end if;
  if p_action not in ('Revision','Cancelled') then raise exception 'Keputusan tidak valid'; end if;
  if nullif(trim(p_note),'') is null then raise exception 'Catatan wajib diisi'; end if;
  update public.requests set status=p_action::public.request_status,
    revision_note=case when p_action='Revision' then trim(p_note) else revision_note end,
    cancellation_note=case when p_action='Cancelled' then trim(p_note) else cancellation_note end,
    reviewed_by=auth.uid(),reviewed_at=now()
  where id=p_request_id and status='Submitted' returning * into v_request;
  if not found then raise exception 'Permohonan tidak dapat diproses'; end if;
  return v_request;
end; $$;
revoke all on function public.review_request(uuid,text,text) from public;
grant execute on function public.review_request(uuid,text,text) to authenticated;
