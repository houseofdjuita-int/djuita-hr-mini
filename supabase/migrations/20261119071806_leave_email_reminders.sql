alter table public.requests
  add column if not exists reminder_sent_at timestamptz;

create index if not exists requests_approved_start_reminder_idx
  on public.requests(start_date)
  where status = 'Approved' and reminder_sent_at is null;

comment on column public.requests.reminder_sent_at is
  'Waktu email pengingat H-3 berhasil dikirim untuk mencegah pengiriman ganda.';
