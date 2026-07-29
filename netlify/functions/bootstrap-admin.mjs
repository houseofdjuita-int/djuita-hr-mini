import { adminClient, authEmail, env, handlerError, json } from './_lib/shared.mjs'

export default async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    if (!process.env.BOOTSTRAP_SECRET || request.headers.get('x-bootstrap-secret') !== process.env.BOOTSTRAP_SECRET) {
      return json({ error: 'Bootstrap secret tidak valid' }, 403)
    }
    const client = adminClient()
    const { count } = await client.from('profiles').select('id', { count: 'exact', head: true })
    if (count) return json({ error: 'Admin awal sudah tersedia' }, 409)
    const body = await request.json()
    const username = String(body.username || '').trim().toLowerCase()
    const fullName = String(body.fullName || '').trim()
    const password = String(body.password || '')
    if (!/^[a-z0-9._-]{4,40}$/.test(username) || fullName.length < 2 || password.length < 10) return json({ error: 'Data Admin awal tidak valid' }, 400)
    const { authDomain } = env()
    const { data, error } = await client.auth.admin.createUser({ email: authEmail(username, authDomain), password, email_confirm: true, user_metadata: { full_name: fullName } })
    if (error) throw error
    const { error: profileError } = await client.from('profiles').insert({ id: data.user.id, username, full_name: fullName, role: 'Admin', active: true })
    if (profileError) { await client.auth.admin.deleteUser(data.user.id); throw profileError }
    await client.from('audit_logs').insert({ actor_id: data.user.id, action: 'admin.bootstrapped', entity_type: 'profile', entity_id: data.user.id })
    return json({ ok: true, user: { id: data.user.id, username, fullName, role: 'Admin' } }, 201)
  } catch (error) {
    return handlerError(error)
  }
}
