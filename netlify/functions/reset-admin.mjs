import { adminClient, env, handlerError, json } from './_lib/shared.mjs'

export default async request => {
  if (request.method !== 'POST') return json({ error: 'Metode tidak diizinkan' }, 405)
  try {
    const expected = process.env.BOOTSTRAP_SECRET
    if (!expected || request.headers.get('x-bootstrap-secret') !== expected) {
      return json({ error: 'Akses ditolak' }, 403)
    }
    const body = await request.json()
    const password = String(body.password || '')
    if (password.length < 12) return json({ error: 'Kata sandi sementara minimal 12 karakter' }, 400)
    const client = adminClient()
    let { data: profile } = await client.from('profiles')
      .select('id,username,full_name,role').eq('role', 'Admin').ilike('full_name', '%Hullia%').limit(1).maybeSingle()
    if (!profile) {
      const result = await client.from('profiles').select('id,username,full_name,role').eq('role', 'Admin').order('created_at').limit(1).single()
      if (result.error) throw result.error
      profile = result.data
    }
    const { error: authError } = await client.auth.admin.updateUserById(profile.id, { password, ban_duration: 'none' })
    if (authError) throw authError
    const { error: profileError } = await client.from('profiles').update({ active: true }).eq('id', profile.id)
    if (profileError) throw profileError
    const { authDomain } = env()
    const { error: verifyError } = await client.auth.signInWithPassword({ email: `${profile.username}@${authDomain}`, password })
    if (verifyError) throw verifyError
    await client.auth.signOut()
    return json({ ok: true, username: profile.username, fullName: profile.full_name, role: profile.role })
  } catch (error) {
    return handlerError(error)
  }
}
