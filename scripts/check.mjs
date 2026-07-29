import fs from 'node:fs'
import vm from 'node:vm'

const html = fs.readFileSync('index.html', 'utf8')
const production = fs.readFileSync('production.js', 'utf8')
const migration = fs.readFileSync('supabase/migrations/202607290001_initial.sql', 'utf8')

for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if (match[1].trim()) new Function(match[1])
}
new vm.Script(production)

const required = [
  ['Supabase RLS profiles', /alter table public\.profiles enable row level security/i.test(migration)],
  ['Supabase RLS requests', /alter table public\.requests enable row level security/i.test(migration)],
  ['Private storage bucket', /'hr-private','hr-private',false/i.test(migration)],
  ['Atomic approval RPC', /function public\.approve_request/i.test(migration)],
  ['Production adapter', /initializeProductionPortal/.test(production)],
  ['No secret key in browser', !/SUPABASE_SECRET_KEY/.test(html + production)]
]

const failed = required.filter(([, passed]) => !passed)
for (const [name, passed] of required) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failed.length) process.exit(1)
