import { schedule } from '@netlify/functions'
import nodemailer from 'nodemailer'
import { adminClient, handlerError, json } from './_lib/shared.mjs'

const RECIPIENTS = ['houseofdjuita@gmail.com', 'hrtiara@gmail.com']
const REMINDED_TYPES = [
  'Pemberitahuan Cuti SPG',
  'Pemberitahuan Libur / Off SPG',
  'Izin Tidak Masuk (Full Shift)'
]

const jakartaDate = offsetDays => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {})
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offsetDays))
  return date.toISOString().slice(0, 10)
}

const formatDate = value => new Date(`${value}T00:00:00+07:00`).toLocaleDateString('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta'
})

const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[character])

const handler = async () => {
  try {
    const gmailUser = process.env.GMAIL_USER || 'houseofdjuita@gmail.com'
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD
    if (!gmailAppPassword) throw new Error('GMAIL_APP_PASSWORD belum dikonfigurasi')

    const targetDate = jakartaDate(3)
    const client = adminClient()
    const { data: requests, error } = await client.from('requests')
      .select('id,employee_name,letter_type,start_date,end_date,shift,replacement_name,document_number')
      .eq('status', 'Approved')
      .eq('start_date', targetDate)
      .is('reminder_sent_at', null)
      .in('letter_type', REMINDED_TYPES)
      .order('employee_name')
    if (error) throw error
    if (!requests?.length) return json({ ok: true, targetDate, sent: 0 })

    const rows = requests.map(item => `<tr>
      <td style="padding:8px;border:1px solid #ddd">${escapeHtml(item.employee_name)}</td>
      <td style="padding:8px;border:1px solid #ddd">${escapeHtml(item.letter_type)}</td>
      <td style="padding:8px;border:1px solid #ddd">${escapeHtml(formatDate(item.start_date))}${item.end_date !== item.start_date ? ` s.d. ${escapeHtml(formatDate(item.end_date))}` : ''}</td>
      <td style="padding:8px;border:1px solid #ddd">${escapeHtml(item.shift || '-')}</td>
      <td style="padding:8px;border:1px solid #ddd">${escapeHtml(item.replacement_name || '-')}</td>
    </tr>`).join('')

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailAppPassword }
    })
    await transporter.sendMail({
      from: `Portal HR Djuita <${gmailUser}>`,
      to: RECIPIENTS.join(', '),
      subject: `Pengingat H-3 cuti/ketidakhadiran · ${formatDate(targetDate)}`,
      text: requests.map(item => `${item.employee_name} — ${item.letter_type} — ${formatDate(item.start_date)} — Pengganti: ${item.replacement_name || '-'}`).join('\n'),
      html: `<div style="font-family:Arial,sans-serif;color:#181817"><h2>Pengingat operasional H-3</h2><p>Berikut cuti atau ketidakhadiran yang sudah disetujui dan akan dimulai tiga hari lagi.</p><table style="border-collapse:collapse;width:100%"><thead><tr><th style="padding:8px;border:1px solid #ddd;text-align:left">Staf</th><th style="padding:8px;border:1px solid #ddd;text-align:left">Jenis</th><th style="padding:8px;border:1px solid #ddd;text-align:left">Periode</th><th style="padding:8px;border:1px solid #ddd;text-align:left">Shift</th><th style="padding:8px;border:1px solid #ddd;text-align:left">SPG pengganti</th></tr></thead><tbody>${rows}</tbody></table><p style="color:#6f706b;font-size:12px">Email otomatis dari Portal HR Djuita. Pastikan jadwal pengganti dan operasional counter sudah siap.</p></div>`
    })

    const ids = requests.map(item => item.id)
    const sentAt = new Date().toISOString()
    const { error: updateError } = await client.from('requests').update({ reminder_sent_at: sentAt }).in('id', ids)
    if (updateError) throw updateError
    await client.from('audit_logs').insert({
      actor_id: null,
      action: 'leave.reminder_sent',
      entity_type: 'request',
      metadata: { request_ids: ids, target_date: targetDate, recipients: RECIPIENTS }
    })
    return json({ ok: true, targetDate, sent: requests.length })
  } catch (error) {
    return handlerError(error)
  }
}

export default schedule('0 1 * * *', handler)
