import { createClient } from '@supabase/supabase-js'
import { adminClient, env, handlerError, json } from './_lib/shared.mjs'

async function requireApprover(request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw Object.assign(new Error('Sesi login diperlukan'), { status: 401 })
  const client = adminClient()
  const { data: authData, error: authError } = await client.auth.getUser(token)
  if (authError || !authData.user) throw Object.assign(new Error('Sesi tidak valid'), { status: 401 })
  const { data: profile, error } = await client.from('profiles').select('id,role,active').eq('id', authData.user.id).single()
  if (error || !profile?.active || !['Admin', 'Approver'].includes(profile.role)) {
    throw Object.assign(new Error('Khusus Admin atau Approver'), { status: 403 })
  }
  return { client, actor: profile, token }
}

const requiredKtpCount = request => request.replacement_name || request.letter_type === 'Surat Pergantian SPG' ? 2 : 1

export default async request => {
  if (request.method !== 'POST') return json({ error: 'Metode tidak diizinkan' }, 405)
  try {
    const { client, actor, token } = await requireApprover(request)
    const body = await request.json()
    const { data: leaveRequest, error: requestError } = await client.from('requests')
      .select('id,status,letter_type,replacement_name').eq('id', body.requestId).single()
    if (requestError || leaveRequest?.status !== 'Submitted') throw Object.assign(new Error('Permohonan tidak dapat disetujui'), { status: 409 })
    const count = requiredKtpCount(leaveRequest)

    if (body.action === 'prepare') {
      const base = `${actor.id}/${leaveRequest.id}/approval-${Date.now()}`
      const paths = Array.from({ length: count }, (_, index) => `${base}/${index ? 'ktp-pengganti' : 'ktp-staf'}.jpg`)
      paths.push(`${base}/signature.png`)
      const uploads = []
      for (const path of paths) {
        const { data, error } = await client.storage.from('hr-private').createSignedUploadUrl(path)
        if (error) throw error
        uploads.push({ path, token: data.token })
      }
      return json({ requiredKtpCount: count, ktpUploads: uploads.slice(0, count), signatureUpload: uploads[count] })
    }

    if (body.action !== 'approve') return json({ error: 'Tindakan tidak dikenal' }, 400)
    const attachmentPaths = Array.isArray(body.attachmentPaths) ? body.attachmentPaths : []
    if (attachmentPaths.length !== count || !body.signaturePath) throw Object.assign(new Error('Lampiran KTP dan tanda tangan belum lengkap'), { status: 400 })
    const expectedPrefix = `${actor.id}/${leaveRequest.id}/approval-`
    if (![...attachmentPaths, body.signaturePath].every(path => typeof path === 'string' && path.startsWith(expectedPrefix))) {
      throw Object.assign(new Error('Lokasi lampiran tidak valid'), { status: 400 })
    }
    for (const path of [...attachmentPaths, body.signaturePath]) {
      const { data, error } = await client.storage.from('hr-private').download(path)
      if (error || !data?.size) throw Object.assign(new Error('File privat belum selesai diunggah'), { status: 400 })
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(data.type) || data.size > 8 * 1024 * 1024) {
        throw Object.assign(new Error('Lampiran harus berupa JPG, PNG, atau WebP maksimal 8 MB'), { status: 400 })
      }
    }
    const { error: updateError } = await client.from('requests').update({ attachment_paths: attachmentPaths }).eq('id', leaveRequest.id).eq('status', 'Submitted')
    if (updateError) throw updateError

    const { url, publishableKey } = env()
    const userClient = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    })
    let result = await userClient.rpc('approve_request', {
      p_request_id: leaveRequest.id,
      p_note: body.note || null,
      p_signature_path: body.signaturePath,
      p_attachment_paths: attachmentPaths
    })
    if (result.error?.code === 'PGRST202') {
      result = await userClient.rpc('approve_request', {
        p_request_id: leaveRequest.id,
        p_note: body.note || null,
        p_signature_path: body.signaturePath
      })
    }
    if (result.error) throw result.error
    return json({ request: result.data })
  } catch (error) {
    return handlerError(error)
  }
}
