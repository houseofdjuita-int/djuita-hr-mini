import { adminClient, handlerError, json } from './_lib/shared.mjs'

const allowedTypes = new Set([
  'Pemberitahuan Cuti SPG',
  'Pemberitahuan Libur / Off SPG',
  'Izin Tidak Masuk (Full Shift)',
  'Izin Pulang Lebih Awal'
])
const allowedShifts = new Set(['Pagi', 'Siang'])
const replacementTypes = new Set(['Pemberitahuan Cuti SPG', 'Pemberitahuan Libur / Off SPG', 'Izin Tidak Masuk (Full Shift)'])
const text = (value, max = 500) => String(value || '').trim().slice(0, max)

export default async request => {
  try {
    const client = adminClient()
    if (request.method === 'GET') {
      const { data, error } = await client.from('staff').select('id,full_name,store').eq('active', true).ilike('position', '%SPG%').order('full_name')
      if (error) throw error
      return json({ staff: data || [] })
    }
    if (request.method !== 'POST') return json({ error: 'Metode tidak diizinkan' }, 405)
    const body = await request.json()
    if (body.website) return json({ ok: true })
    if (!Number.isFinite(body.startedAt) || Date.now() - body.startedAt < 3000) {
      throw Object.assign(new Error('Formulir dikirim terlalu cepat. Silakan periksa kembali.'), { status: 400 })
    }
    const employeeId = text(body.employeeId, 40)
    const nik = text(body.nik, 16)
    const letterType = text(body.letterType, 80)
    const shift = text(body.shift, 20)
    const startDate = text(body.startDate, 10)
    const endDate = text(body.endDate, 10)
    const reason = text(body.reason, 800)
    const detail = text(body.detail, 1000)
    if (!employeeId || !/^\d{16}$/.test(nik) || !allowedTypes.has(letterType) || !allowedShifts.has(shift) || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate || reason.length < 5 || !detail) {
      throw Object.assign(new Error('Data pengajuan belum lengkap atau tidak valid'), { status: 400 })
    }
    const { data: employee, error: employeeError } = await client.from('staff').select('id,full_name,position').eq('id', employeeId).eq('active', true).single()
    if (employeeError || !employee || !/SPG/i.test(employee.position)) throw Object.assign(new Error('Data SPG tidak ditemukan'), { status: 400 })
    const { data: owner, error: ownerError } = await client.from('profiles').select('id').eq('active', true).in('role', ['Admin', 'Operator']).order('role').limit(1).single()
    if (ownerError || !owner) throw new Error('Akun kantor untuk menerima pengajuan belum tersedia')
    const { data, error } = await client.from('requests').insert({
      employee_id: employee.id,
      employee_name: employee.full_name,
      employee_nik: nik,
      letter_type: letterType,
      start_date: startDate,
      end_date: letterType === 'Izin Pulang Lebih Awal' ? startDate : endDate,
      shift,
      detail,
      reason,
      status: 'Submitted',
      replacement_mode: replacementTypes.has(letterType) ? 'external' : null,
      replacement_name: replacementTypes.has(letterType) ? 'DITENTUKAN OLEH KANTOR SAAT PERSETUJUAN' : null,
      replacement_nik: replacementTypes.has(letterType) ? '0000000000000000' : null,
      attachment_paths: [],
      created_by: owner.id
    }).select('id,created_at').single()
    if (error) throw error
    return json({ ok: true, reference: `REQ-${String(data.id).slice(0, 8).toUpperCase()}` }, 201)
  } catch (error) {
    return handlerError(error)
  }
}
