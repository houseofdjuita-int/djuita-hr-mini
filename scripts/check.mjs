import fs from 'node:fs'
import vm from 'node:vm'

const html = fs.readFileSync('index.html', 'utf8')
const production = fs.readFileSync('production.js', 'utf8')
const migration = fs.readFileSync('supabase/migrations/202607290001_initial.sql', 'utf8')
const hardening = fs.readFileSync('supabase/migrations/20261109182658_harden_functions_and_storage.sql', 'utf8')
const approvalGate = fs.readFileSync('supabase/migrations/20261110031852_approval_ktp_gate.sql', 'utf8')
const approvalFunction = fs.readFileSync('netlify/functions/approve-request.mjs', 'utf8')
const publicRequestFunction = fs.readFileSync('netlify/functions/public-request.mjs', 'utf8')

for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if (match[1].trim()) new Function(match[1])
}
new vm.Script(production)

const required = [
  ['Supabase RLS profiles', /alter table public\.profiles enable row level security/i.test(migration)],
  ['Supabase RLS requests', /alter table public\.requests enable row level security/i.test(migration)],
  ['Private storage bucket', /'hr-private','hr-private',false/i.test(migration)],
  ['Atomic approval RPC', /function public\.approve_request/i.test(migration)],
  ['Privileged RPCs not public', /revoke all on function public\.approve_request\(uuid, text, text\) from public, anon/i.test(hardening)],
  ['Storage upsert policy', /create policy storage_update_owner/i.test(hardening)],
  ['Approval requires private KTP', /Lampiran KTP belum lengkap/.test(approvalGate) && /ktp_attachment_count/.test(approvalGate)],
  ['Approver secure upload endpoint', /createSignedUploadUrl/.test(approvalFunction) && /requiredKtpCount/.test(approvalFunction)],
  ['KTP collected at approval', /approvalKtpImages/.test(production) && /attachment_paths: \[\]/.test(production)],
  ['Public no-account request', /adminClient/.test(publicRequestFunction) && /status: 'Submitted'/.test(publicRequestFunction)],
  ['Public request has no KTP upload', !/type="file"/.test(fs.readFileSync('ajukan.html', 'utf8'))],
  ['Production adapter', /initializeProductionPortal/.test(production)],
  ['No secret key in browser', !/SUPABASE_SECRET_KEY/.test(html + production)]
]

const failed = required.filter(([, passed]) => !passed)
for (const [name, passed] of required) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failed.length) process.exit(1)
