import { authEmail, env, handlerError, json, requireAdmin } from './_lib/shared.mjs'

export default async request => {
  try {
    const { client, actor } = await requireAdmin(request)
    if (request.method === 'GET') {
      const { data, error } = await client.from('profiles').select('id,username,full_name,role,active,created_at,updated_at').order('full_name')
      if (error) throw error
      return json({ users: data })
    }
    const body = await request.json()
    const action = body.action || 'upsert'
    if (action === 'upsert') {
      const id = body.id || null
      const username = String(body.username || '').trim().toLowerCase()
      const fullName = String(body.fullName || '').trim()
      const password = String(body.password || '')
      const roles = ['Admin', 'Approver', 'Operator', 'Viewer']
      if (!/^[a-z0-9._-]{4,40}$/.test(username) || fullName.length < 2 || !roles.includes(body.role)) return json({ error: 'Data pengguna tidak valid' }, 400)
      if (!id && password.length < 10) return json({ error: 'Kata sandi awal minimal 10 karakter' }, 400)
      const { authDomain } = env()
      let userId = id
      if (!id) {
        const { data, error } = await client.auth.admin.createUser({ email: authEmail(username, authDomain), password, email_confirm: true, user_metadata: { full_name: fullName } })
        if (error) throw error
        userId = data.user.id
        const { error: profileError } = await client.from('profiles').insert({ id: userId, username, full_name: fullName, role: body.role, active: true })
        if (profileError) { await client.auth.admin.deleteUser(userId); throw profileError }
      } else {
        const { data: target } = await client.from('profiles').select('role,active').eq('id', id).single()
        if (target?.role === 'Admin' && body.role !== 'Admin') {
          const { count } = await client.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'Admin').eq('active', true)
          if ((count || 0) <= 1) return json({ error: 'Minimal satu Admin aktif harus tetap tersedia' }, 409)
        }
        const authUpdate = { email: authEmail(username, authDomain), user_metadata: { full_name: fullName } }
        if (password) { if (password.length < 10) return json({ error: 'Kata sandi minimal 10 karakter' }, 400); authUpdate.password = password }
        const { error: authError } = await client.auth.admin.updateUserById(id, authUpdate)
        if (authError) throw authError
        const { error } = await client.from('profiles').update({ username, full_name: fullName, role: body.role }).eq('id', id)
        if (error) throw error
      }
      await client.from('audit_logs').insert({ actor_id: actor.id, action: id ? 'user.updated' : 'user.created', entity_type: 'profile', entity_id: userId, metadata: { role: body.role } })
      return json({ ok: true, id: userId }, id ? 200 : 201)
    }
    if (action === 'status') {
      const id = String(body.id || '')
      const active = Boolean(body.active)
      const { data: target } = await client.from('profiles').select('role,active').eq('id', id).single()
      if (!target) return json({ error: 'Pengguna tidak ditemukan' }, 404)
      if (!active && target.role === 'Admin') {
        const { count } = await client.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'Admin').eq('active', true)
        if ((count || 0) <= 1) return json({ error: 'Minimal satu Admin aktif harus tetap tersedia' }, 409)
      }
      const { error } = await client.from('profiles').update({ active }).eq('id', id)
      if (error) throw error
      const { error: authError } = await client.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : '876000h' })
      if (authError) throw authError
      await client.from('audit_logs').insert({ actor_id: actor.id, action: active ? 'user.activated' : 'user.deactivated', entity_type: 'profile', entity_id: id })
      return json({ ok: true })
    }
    return json({ error: 'Aksi tidak dikenal' }, 400)
  } catch (error) {
    return handlerError(error)
  }
}
