import { createClient } from '@supabase/supabase-js'

export const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
})

export function env() {
  const url = process.env.SUPABASE_URL
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !publishableKey) throw new Error('Konfigurasi Supabase belum lengkap')
  return { url, publishableKey, secretKey, authDomain: process.env.DJUITA_AUTH_EMAIL_DOMAIN || 'users.djuita.internal' }
}

export function adminClient() {
  const { url, secretKey } = env()
  if (!secretKey) throw new Error('SUPABASE_SECRET_KEY belum tersedia')
  return createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function requireAdmin(request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw Object.assign(new Error('Sesi login diperlukan'), { status: 401 })
  const client = adminClient()
  const { data: authData, error: authError } = await client.auth.getUser(token)
  if (authError || !authData.user) throw Object.assign(new Error('Sesi tidak valid'), { status: 401 })
  const { data: profile, error } = await client.from('profiles').select('id,role,active').eq('id', authData.user.id).single()
  if (error || !profile?.active || profile.role !== 'Admin') throw Object.assign(new Error('Khusus Admin'), { status: 403 })
  return { client, actor: profile }
}

export const authEmail = (username, domain) => `${username.toLowerCase()}@${domain}`

export const handlerError = error => {
  console.error(error)
  return json({ error: error?.message || 'Kesalahan server' }, error?.status || 500)
}
