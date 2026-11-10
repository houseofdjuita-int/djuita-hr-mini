-- KTP is collected by the internal approver, stored in the private bucket,
-- and atomically attached when the official document is approved.
drop policy if exists storage_insert_authorized on storage.objects;
create policy storage_insert_authorized on storage.objects for insert to authenticated
with check (
  bucket_id = 'hr-private'
  and private.current_role() in ('Admin', 'Approver', 'Operator', 'Employee')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_update_owner on storage.objects;
create policy storage_update_owner on storage.objects for update to authenticated
using (
  bucket_id = 'hr-private'
  and private.current_role() in ('Admin', 'Approver', 'Operator', 'Employee')
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'hr-private'
  and private.current_role() in ('Admin', 'Approver', 'Operator', 'Employee')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop function if exists public.approve_request(uuid, text, text);

create function public.approve_request(
  p_request_id uuid,
  p_note text default null,
  p_signature_path text default null,
  p_attachment_paths jsonb default '[]'::jsonb
)
returns public.requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests;
  v_sequence integer;
  v_month integer;
  v_year integer;
  v_roman text;
  v_required_attachments integer;
  v_attachment_count integer;
  v_stored_count integer;
begin
  if private.current_role() not in ('Admin', 'Approver') then
    raise exception 'Akses persetujuan ditolak';
  end if;

  select * into v_request
  from public.requests
  where id = p_request_id
  for update;

  if not found or v_request.status <> 'Submitted' then
    raise exception 'Permohonan tidak dapat disetujui';
  end if;
  if p_signature_path is null then
    raise exception 'Tanda tangan dan cap wajib diunggah';
  end if;
  if jsonb_typeof(p_attachment_paths) <> 'array' then
    raise exception 'Format lampiran KTP tidak valid';
  end if;

  v_required_attachments := case
    when nullif(trim(v_request.replacement_name), '') is not null
      or v_request.letter_type in (
        'Pemberitahuan Cuti SPG',
        'Pemberitahuan Libur / Off SPG',
        'Izin Tidak Masuk (Full Shift)',
        'Surat Pergantian SPG'
      ) then 2
    else 1
  end;
  v_attachment_count := jsonb_array_length(p_attachment_paths);
  if v_attachment_count < v_required_attachments then
    raise exception 'Lampiran KTP belum lengkap';
  end if;

  select count(*) into v_stored_count
  from storage.objects
  where bucket_id = 'hr-private'
    and name in (select jsonb_array_elements_text(p_attachment_paths))
    and (storage.foldername(name))[1] = auth.uid()::text;
  if v_stored_count <> v_attachment_count then
    raise exception 'Lampiran KTP tidak ditemukan di storage privat';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'hr-private'
      and name = p_signature_path
      and (storage.foldername(name))[1] = auth.uid()::text
  ) then
    raise exception 'Tanda tangan tidak ditemukan di storage privat';
  end if;

  v_month := extract(month from now() at time zone 'Asia/Jakarta');
  v_year := extract(year from now() at time zone 'Asia/Jakarta');
  insert into public.document_sequences(year, month, last_value)
  values (v_year, v_month, 1)
  on conflict (year, month) do update
    set last_value = public.document_sequences.last_value + 1
  returning last_value into v_sequence;
  v_roman := (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[v_month];

  update public.requests
  set status = 'Approved',
      approval_note = nullif(trim(p_note), ''),
      attachment_paths = p_attachment_paths,
      signature_path = p_signature_path,
      approved_by = auth.uid(),
      approved_at = now(),
      document_number = format('UMS/DJUITA/%s/%s/%s', lpad(v_sequence::text, 3, '0'), v_roman, v_year)
  where id = p_request_id
  returning * into v_request;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'request.approved', 'request', p_request_id::text,
    jsonb_build_object('document_number', v_request.document_number, 'ktp_attachment_count', v_attachment_count)
  );
  return v_request;
end
$$;

revoke all on function public.approve_request(uuid, text, text, jsonb) from public, anon;
grant execute on function public.approve_request(uuid, text, text, jsonb) to authenticated, service_role;
