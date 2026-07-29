/* Production adapter: Supabase Auth/Postgres/Storage + Netlify Functions. */
(() => {
  let client = null
  let config = null
  let productionMode = false
  const legacyInitializeLogin = initializeLogin
  const legacyActivateSession = activateSession
  const legacyLogin = login
  const legacyLogout = logout
  const legacyPersist = persist
  const legacyOpenReview = openReview
  const legacyOpenAccessUser = openAccessUser
  const legacySaveAccessUser = saveAccessUser
  const legacyToggleAccessUser = toggleAccessUser
  const legacyResetAccessPassword = resetAccessPassword
  const legacySaveRequest = saveRequest
  const legacyDecide = decide
  const legacySafeOpenDocument = safeOpenDocument
  const legacyDownloadSelectedDocuments = downloadSelectedDocuments

  const showBackendState = message => {
    const note = document.querySelector('#access .access-note')
    if (note) note.innerHTML = `<b>Status sistem:</b> ${esc(message)}`
  }

  const api = async (path, options = {}) => {
    const { data: { session } } = await client.auth.getSession()
    const response = await fetch(path, {
      ...options,
      headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session.access_token}` } : {}), ...(options.headers || {}) }
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || `Server error ${response.status}`)
    return payload
  }

  const authAddress = username => `${username.trim().toLowerCase()}@${config.authDomain}`
  const profileForUi = profile => ({
    id: profile.id,
    name: profile.full_name,
    username: profile.username,
    role: profile.role,
    active: profile.active,
    updated: profile.updated_at
  })

  const mapRequest = row => ({
    id: row.id,
    employeeId: row.employee_id,
    employee: row.employee_name,
    nik: row.employee_nik,
    type: row.letter_type,
    date: row.start_date,
    endDate: row.end_date,
    shift: row.shift,
    detail: row.detail,
    reason: row.reason,
    replacementMode: row.replacement_mode,
    replacementName: row.replacement_name,
    replacementNik: row.replacement_nik,
    attachmentPaths: row.attachment_paths || [],
    signaturePath: row.signature_path,
    status: row.status,
    documentNumber: row.document_number,
    approvalNote: row.approval_note,
    rejectionNote: row.rejection_note,
    approvedBy: row.approved_profile?.full_name,
    approvedAt: row.approved_at ? new Date(row.approved_at).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' }) + ' WIB' : null,
    rejectedAt: row.rejected_at,
    created: new Date(row.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
  })

  const loadProfile = async userId => {
    const { data, error } = await client.from('profiles').select('id,username,full_name,role,active,updated_at').eq('id', userId).single()
    if (error || !data?.active) throw new Error('Akun tidak aktif atau profil tidak tersedia')
    return data
  }

  const loadStaff = async () => {
    const { data, error } = await client.from('staff').select('id,full_name,position,store,active').eq('active', true).order('full_name')
    if (error) throw error
    staff.splice(0, staff.length, ...data.map(item => ({
      id: item.id,
      name: item.full_name,
      role: item.position,
      store: item.store,
      initial: item.full_name.split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase()
    })))
  }

  const loadRequests = async () => {
    const { data, error } = await client.from('requests').select('*,approved_profile:profiles!requests_approved_by_fkey(full_name)').order('created_at', { ascending: false })
    if (error) throw error
    requests = data.map(mapRequest)
    render()
  }

  const activateProductionSession = async authUser => {
    const profile = await loadProfile(authUser.id)
    await Promise.all([loadStaff(), loadRequests()])
    legacyActivateSession(profileForUi(profile))
    showBackendState('Mode produksi aktif. Pengguna, permohonan, dan dokumen tersinkron melalui backend bersama.')
  }

  const dataUrlBlob = dataUrl => {
    const [header, encoded] = dataUrl.split(',')
    const mime = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream'
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0))
    return new Blob([bytes], { type: mime })
  }

  const blobDataUrl = blob => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

  const uploadData = async (dataUrl, path) => {
    const blob = dataUrlBlob(dataUrl)
    const { error } = await client.storage.from('hr-private').upload(path, blob, { contentType: blob.type, upsert: false })
    if (error) throw error
    return path
  }

  const downloadData = async path => {
    const { data, error } = await client.storage.from('hr-private').download(path)
    if (error) throw error
    return blobDataUrl(data)
  }

  const loadAccessUsers = async () => {
    const payload = await api('/api/users')
    accessUsers = payload.users.map(profileForUi)
    renderAccessUsers()
  }

  window.initializeProductionPortal = async () => {
    try {
      const response = await fetch('/api/config', { cache: 'no-store' })
      if (!response.ok) throw new Error('Endpoint backend belum tersedia')
      config = await response.json()
      if (!config.supabaseUrl || !config.supabasePublishableKey || !window.supabase?.createClient) throw new Error('Konfigurasi backend belum lengkap')
      client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
      productionMode = true
      document.body.dataset.backend = 'production'
      const { data: { session } } = await client.auth.getSession()
      if (session?.user) await activateProductionSession(session.user)
      else {
        document.getElementById('loginTitle').textContent = 'Masuk ke Portal HR'
        document.getElementById('loginGuide').textContent = 'Gunakan username dan kata sandi yang diberikan Admin.'
        document.getElementById('loginPage').classList.remove('hidden')
      }
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session) document.getElementById('loginPage').classList.remove('hidden')
      })
    } catch (error) {
      console.warn('Backend production belum aktif:', error.message)
      document.body.dataset.backend = 'local-preview'
      legacyInitializeLogin()
      showBackendState('Mode pratinjau lokal. Hubungkan Supabase dan Netlify sebelum dipakai lintas perangkat.')
    }
  }

  login = async event => {
    if (!productionMode) return legacyLogin(event)
    event.preventDefault()
    const username = document.getElementById('loginUsername').value.trim().toLowerCase()
    const password = document.getElementById('loginPassword').value
    const errorBox = document.getElementById('loginError')
    const button = document.getElementById('loginButton')
    errorBox.textContent = ''
    button.disabled = true
    button.textContent = 'Memeriksa…'
    try {
      const { data, error } = await client.auth.signInWithPassword({ email: authAddress(username), password })
      if (error) throw new Error('Username atau kata sandi tidak sesuai')
      await activateProductionSession(data.user)
    } catch (error) {
      errorBox.textContent = error.message
      await client.auth.signOut().catch(() => {})
    } finally {
      button.disabled = false
      button.textContent = 'Masuk'
    }
  }

  logout = async () => {
    if (!productionMode) return legacyLogout()
    await client.auth.signOut()
    currentUser = null
    requests = []
    document.getElementById('userMenu').classList.remove('show')
    document.getElementById('loginPassword').value = ''
    document.getElementById('loginPage').classList.remove('hidden')
  }

  persist = () => productionMode ? undefined : legacyPersist()

  openReview = id => {
    if (!['Admin', 'Approver'].includes(currentUser?.role)) {
      notify('Hanya Admin atau Approver yang dapat meninjau persetujuan')
      return
    }
    legacyOpenReview(id)
    if (productionMode) {
      const approver = document.getElementById('approverSelect')
      approver.innerHTML = `<option>${esc(currentUser.name)}</option>`
      approver.disabled = true
    }
  }

  openAccessUser = id => {
    if (productionMode && currentUser?.role !== 'Admin') { notify('Khusus Admin'); return }
    legacyOpenAccessUser(id)
  }

  saveAccessUser = async event => {
    if (!productionMode) return legacySaveAccessUser(event)
    event.preventDefault()
    const payload = {
      action: 'upsert',
      id: document.getElementById('accessUserId').value || null,
      fullName: document.getElementById('accessName').value.trim(),
      username: document.getElementById('accessUsername').value.trim().toLowerCase(),
      role: document.getElementById('accessRole').value,
      password: document.getElementById('accessPassword').value
    }
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify(payload) })
      await loadAccessUsers()
      closeModal('accessUserModal')
      notify('Pengguna berhasil disimpan di server')
    } catch (error) { notify(error.message) }
  }

  toggleAccessUser = async id => {
    if (!productionMode) return legacyToggleAccessUser(id)
    const user = accessUsers.find(item => item.id === id)
    if (!user) return
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify({ action: 'status', id, active: !user.active }) })
      await loadAccessUsers()
      notify(user.active ? 'Pengguna dinonaktifkan' : 'Pengguna diaktifkan')
    } catch (error) { notify(error.message) }
  }

  resetAccessPassword = id => {
    if (!productionMode) return legacyResetAccessPassword(id)
    openAccessUser(id)
    document.getElementById('accessPassword').required = true
    document.getElementById('accessPasswordLabel').textContent = 'Kata sandi baru'
    notify('Masukkan kata sandi baru lalu simpan pengguna')
  }

  saveRequest = async event => {
    if (!productionMode) return legacySaveRequest(event)
    event.preventDefault()
    if (!['Admin', 'Operator'].includes(currentUser?.role)) { notify('Anda tidak memiliki akses membuat permohonan'); return }
    const type = document.getElementById('typeSelect').value
    const employeeName = document.getElementById('employeeSelect').value
    const employee = staff.find(item => item.name === employeeName)
    const nik = document.getElementById('nikInput').value.trim()
    const reason = document.getElementById('reasonInput').value.trim()
    const detail = document.getElementById('detailInput').value.trim()
    const startDate = document.getElementById('dateInput').value
    const endDate = document.getElementById('endDateInput').value
    const shift = document.getElementById('shiftInput').value
    const needsReplacement = requiresReplacement(type)
    const replacementMode = needsReplacement ? document.getElementById('replacementMode').value : null
    const replacementName = needsReplacement ? (replacementMode === 'registered' ? document.getElementById('replacementStaff').value : document.getElementById('replacementName').value.trim()) : null
    const replacementNik = needsReplacement ? document.getElementById('replacementNik').value.trim() : null
    if (!employee || !/^\d{16}$/.test(nik) || !reason || !detail || !startDate || !endDate || endDate < startDate) { notify('Lengkapi data permohonan dengan benar'); return }
    if (needsReplacement && (!replacementName || !/^\d{16}$/.test(replacementNik))) { notify('Nama dan NIK SPG pengganti wajib lengkap'); return }
    if (!ktpImageData || (needsReplacement && !secondKtpImageData)) { notify('Lampiran KTP wajib lengkap'); return }
    const id = crypto.randomUUID()
    const base = `${currentUser.id}/${id}`
    try {
      const paths = [await uploadData(ktpImageData, `${base}/ktp-staff.jpg`)]
      if (secondKtpImageData) paths.push(await uploadData(secondKtpImageData, `${base}/ktp-pengganti.jpg`))
      const { error } = await client.from('requests').insert({
        id, employee_id: employee.id, employee_name: employeeName, employee_nik: nik, letter_type: type,
        start_date: startDate, end_date: endDate, shift, detail: `Jadwal tidak masuk: ${formatDate(startDate)}${endDate !== startDate ? ' s.d. ' + formatDate(endDate) : ''}\nShift: ${shift}\n${detail}`,
        reason, replacement_mode: replacementMode, replacement_name: replacementName, replacement_nik: replacementNik,
        attachment_paths: paths, status: event.submitter?.textContent?.toLowerCase().includes('draf') ? 'Draft' : 'Submitted', created_by: currentUser.id
      })
      if (error) throw error
      closeModal('requestModal')
      await loadRequests()
      showView('approvals')
      notify('Permohonan berhasil disimpan di server')
    } catch (error) { notify(`Permohonan gagal disimpan: ${error.message}`) }
  }

  decide = async action => {
    if (!productionMode) return legacyDecide(action)
    if (!['Admin', 'Approver'].includes(currentUser?.role)) { notify('Akses persetujuan ditolak'); return }
    const note = document.getElementById('approverNote').value.trim()
    try {
      if (action === 'Rejected') {
        const { error } = await client.rpc('reject_request', { p_request_id: reviewId, p_note: note })
        if (error) throw error
      } else {
        if (!signatureData) { notify('Unggah tanda tangan dan cap terlebih dahulu'); return }
        const signaturePath = await uploadData(signatureData, `${currentUser.id}/${reviewId}/signature-${Date.now()}.png`)
        const { error } = await client.rpc('approve_request', { p_request_id: reviewId, p_note: note, p_signature_path: signaturePath })
        if (error) throw error
      }
      closeModal('reviewModal')
      await loadRequests()
      notify(action === 'Rejected' ? 'Permohonan ditolak' : 'Permohonan disetujui dan nomor surat dibuat')
    } catch (error) { notify(error.message) }
  }

  safeOpenDocument = async id => {
    if (!productionMode) return legacySafeOpenDocument(id)
    const request = requests.find(item => String(item.id) === String(id))
    if (!request) return
    try {
      request.ktpImages = await Promise.all((request.attachmentPaths || []).map(downloadData))
      signatureData = request.signaturePath ? await downloadData(request.signaturePath) : ''
      openDocument(id)
    } catch (error) { notify(`Dokumen privat gagal dimuat: ${error.message}`) }
  }

  downloadSelectedDocuments = async () => {
    if (!productionMode) return legacyDownloadSelectedDocuments()
    try {
      const selected = requests.filter(request => request.status === 'Approved' && documentSelection.has(String(request.id)))
      for (const request of selected) {
        request.ktpImages = await Promise.all((request.attachmentPaths || []).map(downloadData))
        if (request.signaturePath) request.cachedSignature = await downloadData(request.signaturePath)
      }
      const originalOpenDocument = openDocument
      openDocument = id => {
        const request = requests.find(item => String(item.id) === String(id))
        signatureData = request?.cachedSignature || ''
        originalOpenDocument(id)
      }
      try { await legacyDownloadSelectedDocuments() } finally { openDocument = originalOpenDocument }
    } catch (error) { notify(`Unduh massal gagal: ${error.message}`) }
  }

  const originalShowView = showView
  showView = id => {
    if (productionMode && id === 'access' && currentUser?.role !== 'Admin') { notify('Khusus Admin'); return }
    originalShowView(id)
    if (productionMode && id === 'access') loadAccessUsers().catch(error => notify(error.message))
  }

  window.initializeProductionPortal()
})()
