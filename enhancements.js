/* Operational UX enhancements recovered from the July 2026 UAT. */
(() => {
  const CUTI = 'Pemberitahuan Cuti SPG'
  const OFF = 'Pemberitahuan Libur / Off SPG'
  const FULL = 'Izin Tidak Masuk (Full Shift)'
  const EARLY = 'Izin Pulang Lebih Awal'
  const ASSIST = 'Surat Penugasan Staff Perbantuan SPG'
  const structuredTypes = new Set([CUTI, OFF, FULL, EARLY])
  const el = id => document.getElementById(id)

  el('loginPassword').minLength = 5
  const employeeRole = 'Employee'
  const originalLogin = login
  window.login = async event => {
    const username = el('loginUsername').value.trim().toLowerCase()
    const password = el('loginPassword').value
    if (['localhost', '127.0.0.1'].includes(location.hostname) && username === 'admin' && password === 'admin') {
      event.preventDefault()
      const user = accessUsers.find(item => item.username.toLowerCase() === 'admin' && item.active)
      if (user) { sessionStorage.setItem('djuitaSessionUser', user.id); activateSession(user); return }
    }
    return originalLogin(event)
  }

  document.head.insertAdjacentHTML('beforeend', `<style>
    .schedule-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px;padding:2px 0}
    .structured-summary{margin:8px 0 15px;padding:12px 14px;border-radius:10px;background:#f4f7f5;color:#087443;font-size:11px;line-height:1.55}
    .letter-sign .signature-mark{width:auto!important;height:auto!important;max-width:260px!important;max-height:120px!important;object-fit:contain;object-position:left center}
    .badge.revision{background:#fff8e6;color:#9a6700}.badge.cancelled{background:#f1f1ef;color:#666}
    @media(max-width:700px){.schedule-grid{grid-template-columns:1fr}}
  </style>`)

  const typeSelect = el('typeSelect')
  if (![...typeSelect.options].some(option => option.value === OFF)) {
    const option = new Option(OFF, OFF)
    typeSelect.options[0].after(option)
  }

  const employeeField = el('employeeSelect').closest('.field')
  employeeField.id = 'currentStaffField'
  employeeField.insertAdjacentHTML('afterend', '<div id="assistanceStaffField" class="field" style="display:none"><label>Nama staff perbantuan</label><input id="assistanceName" placeholder="Diisi otomatis dari KTP atau ketik nama lengkap"></div>')
  el('nikInput').closest('.field').querySelector('label').id = 'identityLabel'
  el('detailInput').closest('.field').id = 'detailField'
  el('ktpInput').style.display = 'none'
  el('ktpStatus').textContent = 'Foto KTP tidak diperlukan saat pengajuan. Kantor akan mengunggahnya secara privat pada tahap persetujuan internal.'
  el('secondKtpField').style.display = 'none'

  const roleSelect = el('accessRole')
  roleSelect.add(new Option('Pegawai/SPG — ajukan dan lihat permohonan sendiri', employeeRole))
  roleSelect.closest('.field').insertAdjacentHTML('afterend', '<div id="linkedStaffField" class="field" style="display:none"><label>Terhubung ke staf</label><select id="linkedStaffId"></select><small class="credential-help">Nama, lokasi, dan identitas pengajuan akan dikunci sesuai staf ini.</small></div>')
  const syncLinkedStaffField = () => {
    const show = roleSelect.value === employeeRole
    el('linkedStaffField').style.display = show ? 'block' : 'none'
    el('linkedStaffId').required = show
    if (show) el('linkedStaffId').innerHTML = staff.map(item => `<option value="${esc(item.id)}">${esc(item.name)} · ${esc(item.store)}</option>`).join('')
  }
  roleSelect.addEventListener('change', syncLinkedStaffField)
  const originalOpenAccessUser = openAccessUser
  window.openAccessUser = id => { originalOpenAccessUser(id); syncLinkedStaffField(); const user = accessUsers.find(item => item.id === id); if (user?.staffId) el('linkedStaffId').value = user.staffId }
  const originalSaveAccessUser = saveAccessUser
  window.saveAccessUser = async event => {
    const id = el('accessUserId').value
    const username = el('accessUsername').value.trim().toLowerCase()
    const role = roleSelect.value
    const staffId = role === employeeRole ? el('linkedStaffId').value : ''
    await originalSaveAccessUser(event)
    const user = accessUsers.find(item => item.id === id || item.username === username)
    if (user) { user.staffId = staffId; persistAccessUsers() }
  }

  const startField = el('dateInput').closest('.field')
  startField.querySelector('label').textContent = 'Tanggal mulai / tanggal izin'
  const endField = el('endDateInput').closest('.field')
  endField.id = 'endDateField'
  const shiftField = el('shiftInput').closest('.field')
  shiftField.querySelector('label').id = 'shiftLabel'
  shiftField.querySelector('small').id = 'shiftGuide'
  const grid = document.createElement('div')
  grid.className = 'schedule-grid'
  startField.before(grid)
  grid.append(startField, endField, shiftField)
  grid.insertAdjacentHTML('beforeend', `
    <div id="leaveCategoryField" class="field"><label>Jenis cuti</label><select id="leaveCategory"><option>Cuti tahunan</option><option>Keperluan keluarga</option><option>Keperluan pribadi</option><option>Cuti melahirkan</option><option>Lainnya</option></select></div>
    <div id="earlyLeaveField" class="field" style="display:none"><label>Jam izin pulang</label><select id="earlyLeaveTime"></select><small class="form-guide">Jam pulang normal mengikuti shift secara otomatis.</small></div>`)
  grid.insertAdjacentHTML('afterend', '<div id="structuredSummary" class="structured-summary" style="display:none"></div>')

  window.requiresReplacement = type => [CUTI, OFF, FULL].includes(type)
  window.usesStructuredDetail = type => structuredTypes.has(type)
  letterGuides[OFF] = { label: 'Rincian libur / off', guide: 'Rincian dibuat otomatis dari tanggal dan shift.', template: '' }

  window.syncEarlyLeaveTimes = () => {
    const shift = el('shiftInput').value
    const select = el('earlyLeaveTime')
    const previous = select.value
    const start = shift === 'Pagi' ? 10 : 15
    const end = shift === 'Pagi' ? 16.5 : 20.5
    const values = []
    for (let value = start; value <= end; value += .5) values.push(`${String(Math.floor(value)).padStart(2, '0')}.${value % 1 ? '30' : '00'}`)
    select.innerHTML = values.map(value => `<option value="${value}">${value} WIB</option>`).join('')
    select.value = values.includes(previous) ? previous : values[Math.max(0, values.length - 3)]
    updateStructuredSummary()
  }

  const nextDate = value => { const date = new Date(value + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10) }
  window.buildStructuredDetail = () => {
    const type = typeSelect.value
    if (!structuredTypes.has(type)) return el('detailInput').value.trim()
    const start = el('dateInput').value
    const shift = el('shiftInput').value
    if (type === EARLY) return start ? `Shift kerja: ${shift}\nJam izin pulang: ${el('earlyLeaveTime').value} WIB\nJam pulang normal: ${shift === 'Pagi' ? '17.00' : '21.00'} WIB` : ''
    const end = el('endDateInput').value
    if (!start || !end || end < start) return ''
    const days = Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1
    const period = `${formatDate(start)} s.d. ${formatDate(end)}`
    const back = formatDate(nextDate(end))
    if (type === CUTI) return `Shift: ${shift}\nDurasi cuti: ${days} hari\nPeriode cuti: ${period}\nJenis cuti: ${el('leaveCategory').value}\nKembali bekerja: ${back}`
    if (type === OFF) return `Shift: ${shift}\nDurasi libur/off: ${days} hari\nPeriode libur/off: ${period}\nKembali bekerja: ${back}`
    return `Shift: ${shift}\nDurasi izin: ${days} shift\nPeriode izin: ${period}\nKembali bekerja: ${back}`
  }

  window.updateStructuredSummary = () => {
    const structured = structuredTypes.has(typeSelect.value)
    const summary = el('structuredSummary')
    summary.style.display = structured ? 'block' : 'none'
    if (!structured) return
    const detail = buildStructuredDetail()
    el('detailInput').value = detail
    summary.innerHTML = detail ? `<b>Rincian otomatis untuk surat</b><br>${detail.split('\n').map(esc).join('<br>')}` : 'Lengkapi pilihan di atas untuk membuat rincian surat otomatis.'
  }

  const originalSyncGuide = syncLetterGuide
  window.syncLetterGuide = force => {
    const type = typeSelect.value
    const early = type === EARLY
    const assistance = type === ASSIST
    const structured = structuredTypes.has(type)
    el('currentStaffField').style.display = assistance ? 'none' : 'block'
    el('employeeSelect').required = !assistance
    el('assistanceStaffField').style.display = assistance ? 'block' : 'none'
    el('assistanceName').required = assistance
    el('identityLabel').textContent = assistance ? 'NIK staff perbantuan' : 'NIK / Nomor KTP'
    el('detailField').style.display = structured ? 'none' : 'block'
    el('detailInput').required = !structured
    el('endDateField').style.display = early ? 'none' : 'block'
    el('endDateInput').required = !early
    el('shiftLabel').textContent = early ? 'Shift kerja' : 'Shift tidak masuk'
    el('shiftGuide').textContent = early ? 'Pilih shift kerja SPG pada tanggal izin.' : 'Pilih shift kerja SPG yang tidak hadir.'
    el('earlyLeaveField').style.display = early ? 'block' : 'none'
    el('leaveCategoryField').style.display = type === CUTI ? 'block' : 'none'
    originalSyncGuide(force)
    el('secondKtpField').style.display = 'none'
    el('nikGuide').textContent = assistance ? 'Isi NIK staff perbantuan. Foto KTP akan diunggah oleh kantor saat persetujuan.' : 'Isi 16 digit NIK. Foto KTP akan diunggah oleh kantor saat persetujuan internal.'
    if (early) syncEarlyLeaveTimes()
    updateStructuredSummary()
  }

  ;['dateInput', 'endDateInput', 'leaveCategory', 'earlyLeaveTime'].forEach(id => el(id).addEventListener('change', updateStructuredSummary))
  el('shiftInput').addEventListener('change', syncEarlyLeaveTimes)

  const parseKtpIdentity = text => {
    const raw = String(text || '').replace(/\r/g, '').toUpperCase()
    const lines = raw.split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
    const numberText = raw.replace(/[OQD]/g, '0').replace(/[IL|]/g, '1').replace(/S/g, '5').replace(/B/g, '8')
    const candidates = numberText.match(/\d(?:[\s.:-]*\d){15}/g) || []
    const nik = candidates.map(value => value.replace(/\D/g, '')).find(value => value.length === 16) || ''
    let name = ''
    for (let i = 0; i < lines.length; i++) { const match = lines[i].match(/^(?:NAMA|NAME)\s*[:;\-]?\s*(.*)$/); if (match) { name = (match[1] || lines[i + 1] || '').replace(/[^A-Z .'\-]/g, '').trim(); if (name) break } }
    return { nik, name }
  }
  const findStaff = name => { const normalize = value => String(value || '').toUpperCase().replace(/\([^)]*\)/g, '').replace(/[^A-Z]/g, ''); const target = normalize(name); return staff.find(item => target && (target.includes(normalize(item.name)) || normalize(item.name).includes(target))) }
  const recognizeKtp = async (file, status) => { let worker; try { worker = await Tesseract.createWorker('eng', 1, { logger: message => { if (message.status === 'recognizing text') status.textContent = `Membaca NIK dan nama… ${Math.round((message.progress || 0) * 100)}%` } }); const result = await worker.recognize(file); return parseKtpIdentity(result.data.text) } finally { if (worker) await worker.terminate() } }
  const prepareImage = async (event, status) => { const file = event.target.files[0]; if (!file) return null; if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) throw new Error('Gunakan gambar KTP maksimal 8 MB.'); const data = await compressKtp(file); status.textContent = 'Membaca NIK dan nama… 0%'; return { file, data, identity: await recognizeKtp(file, status) } }
  window.readKtp = async event => { const status = el('ktpStatus'); try { const result = await prepareImage(event, status); if (!result) return; ktpImageData = result.data; const { identity } = result; const assistance = typeSelect.value === ASSIST; if (identity.nik) el('nikInput').value = identity.nik; if (assistance && identity.name) el('assistanceName').value = identity.name.replace(/\b\w/g, letter => letter.toUpperCase()); if (!assistance) { const matched = findStaff(identity.name); if (matched) { el('employeeSelect').value = matched.name; syncEmployee(); if (identity.nik) el('nikInput').value = identity.nik } } status.textContent = 'Hasil OCR sudah dimasukkan. Periksa kembali nama dan NIK sebelum mengajukan.' } catch (error) { status.textContent = error.message || 'OCR gagal; isi nama dan NIK secara manual.' } }
  window.loadSecondKtp = async event => { const status = el('secondKtpStatus'); try { const result = await prepareImage(event, status); if (!result) return; secondKtpImageData = result.data; const { identity } = result; if (identity.nik) el('replacementNik').value = identity.nik; if (el('replacementMode').value === 'external' && identity.name) el('replacementName').value = identity.name.replace(/\b\w/g, letter => letter.toUpperCase()); status.textContent = 'Nama dan NIK SPG pengganti berhasil diproses; periksa kembali hasilnya.' } catch (error) { status.textContent = error.message || 'OCR gagal; isi manual.' } }

  const originalOpenRequest = openRequest
  window.openRequest = () => {
    originalOpenRequest()
    const selfService = currentUser?.role === employeeRole
    el('employeeSelect').disabled = selfService
    if (selfService) {
      const linked = staff.find(item => item.id === currentUser.staffId) || staff.find(item => item.name === currentUser.name)
      if (!linked) { closeModal('requestModal'); notify('Akun belum dihubungkan ke data staf. Hubungi Admin.'); return }
      el('employeeSelect').value = linked.name
      syncEmployee(); syncReplacementMode()
    }
    el('endDateInput').value = el('dateInput').value; el('leaveCategory').value = 'Cuti tahunan'; syncEarlyLeaveTimes(); syncLetterGuide(false)
  }

  const originalSave = saveRequest
  window.saveRequest = (event, status = 'Submitted') => {
    const type = typeSelect.value
    const start = el('dateInput').value
    const end = type === EARLY ? start : el('endDateInput').value
    el('endDateInput').value = end
    if (!end || end < start) { event.preventDefault(); notify('Tanggal selesai tidak boleh sebelum tanggal mulai'); return }
    if (type === ASSIST) { const name = el('assistanceName').value.trim(); if (!name) { event.preventDefault(); notify('Nama staff perbantuan wajib diisi'); return } el('employeeSelect').innerHTML = `<option value="${esc(name)}">${esc(name)}</option>`; el('employeeSelect').value = name; secondKtpImageData = ktpImageData }
    updateStructuredSummary()
    const before = requests[0]?.id
    originalSave(event, status)
    if (type === ASSIST) secondKtpImageData = ''
    if (requests[0]?.id !== before) { const request = requests[0]; request.endDate = end; request.shift = el('shiftInput').value; if (type === ASSIST) request.ktpImages = [ktpImageData]; persist(); render() }
    if (requests[0]?.id !== before && currentUser) { requests[0].createdBy = currentUser.id; persist() }
  }

  statusLabel.Revision = 'Perlu Revisi'; statusLabel.Cancelled = 'Dianulir'
  const actions = document.querySelector('#reviewModal .modal-actions')
  const approve = el('approveButton')
  actions.insertBefore(Object.assign(document.createElement('button'), { id: 'revisionButton', className: 'secondary', textContent: 'Minta Revisi', onclick: () => decide('Revision') }), approve)
  actions.insertBefore(Object.assign(document.createElement('button'), { id: 'cancelRequestButton', className: 'danger', textContent: 'Anulir', onclick: () => decide('Cancelled') }), approve)
  el('filter').insertAdjacentHTML('beforeend', '<option value="Revision">Perlu Revisi</option><option value="Cancelled">Dianulir</option>')
  const originalDecide = decide
  window.decide = action => {
    if (!['Revision', 'Cancelled'].includes(action)) return originalDecide(action)
    const request = requests.find(item => String(item.id) === String(reviewId))
    const note = el('approverNote').value.trim()
    if (!note) { notify('Catatan wajib diisi untuk revisi atau anulir'); return }
    request.status = action
    request[action === 'Revision' ? 'revisionNote' : 'cancellationNote'] = note
    request.reviewedBy = el('approverSelect').value
    request.reviewedAt = new Date().toLocaleString('id-ID') + ' WIB'
    persist(); closeModal('reviewModal'); render(); notify(action === 'Revision' ? 'Dikembalikan untuk revisi' : 'Permohonan dianulir')
  }

  const originalRequestRow = requestRow
  window.requestRow = (request, review = false) => {
    let html = originalRequestRow(request, review)
    const note = request.revisionNote || request.cancellationNote
    if (note) html = html.replace('</div><div class="approval-actions">', `<p><b>Catatan keputusan:</b> ${esc(note)}</p></div><div class="approval-actions">`)
    return html
  }
  const originalRender = render
  window.render = () => {
    originalRender()
    if (currentUser?.role === employeeRole) {
      const linked = staff.find(item => item.id === currentUser.staffId) || staff.find(item => item.name === currentUser.name)
      const own = requests.filter(request => request.createdBy === currentUser.id || request.employeeId === linked?.id || request.employee === linked?.name)
      el('approvalList').innerHTML = own.length ? own.map(request => requestRow(request, false)).join('') : '<div class="empty">Belum ada pengajuan.</div>'
      el('recentApprovals').innerHTML = own.slice(0, 3).map(request => requestRow(request, false)).join('') || '<div class="empty">Belum ada pengajuan terbaru.</div>'
      el('pendingStat').textContent = own.filter(request => request.status === 'Submitted').length
      el('approvedStat').textContent = own.filter(request => request.status === 'Approved').length
    }
    el('historyList').innerHTML = requests.filter(request => ['Approved', 'Rejected', 'Revision', 'Cancelled'].includes(request.status)).map(request => `<div class="request"><div><h3>${esc(statusLabel[request.status])} · ${esc(request.employee)}</h3><p>${esc(request.type)} · ${esc(request.reviewedAt || request.decided || request.created)}</p></div>${badge(request.status)}</div>`).join('') || '<div class="empty">Belum ada aktivitas.</div>'
  }

  const originalActivateSession = activateSession
  window.activateSession = user => {
    originalActivateSession(user)
    const selfService = user.role === employeeRole
    document.querySelectorAll('[onclick="openRequest()"]').forEach(button => button.style.display = ['Admin', 'Operator', employeeRole].includes(user.role) ? '' : 'none')
    document.querySelectorAll('.nav button').forEach(button => { if (selfService) button.style.display = ['dashboard', 'approvals'].includes(button.dataset.view) ? 'flex' : 'none'; else if (button.id !== 'accessNav') button.style.display = 'flex' })
    if (selfService) {
      document.querySelector('#approvals h1').textContent = 'Pengajuan Saya'
      document.querySelector('#approvals .hero p').textContent = 'Ajukan dan pantau status cuti, libur/off, atau izin Anda.'
      document.querySelector('#approvals .hero .primary').textContent = '＋ Ajukan izin / cuti'
    }
    ;[...typeSelect.options].forEach(option => { option.disabled = selfService && ![CUTI, OFF, FULL, EARLY].includes(option.value) })
    if (selfService && typeSelect.selectedOptions[0]?.disabled) typeSelect.value = CUTI
    render()
  }

  const originalOpenDocument = openDocument
  window.openDocument = id => {
    originalOpenDocument(id)
    const request = requests.find(item => String(item.id) === String(id))
    const table = el('documentSheet').querySelector('.letter-details')
    const row = [...table.rows].find(item => item.cells[0]?.textContent.trim() === 'Rincian')
    if (row) { const rows = String(request.detail || '').trim().split(/\n+/).filter(Boolean).map(line => { const split = line.indexOf(':'); const tr = document.createElement('tr'); const label = document.createElement('td'); const value = document.createElement('td'); label.textContent = split < 0 ? 'Keterangan' : line.slice(0, split).trim(); value.textContent = ': ' + (split < 0 ? line : line.slice(split + 1).trim()); tr.append(label, value); return tr }); row.replaceWith(...rows) }
    const verification = el('documentSheet').querySelector('.verification')
    const attachment = el('documentSheet').querySelector('.attachment-page')
    if (attachment && verification && !attachment.querySelector('.verification')) attachment.insertAdjacentHTML('beforeend', `<div class="verification">${verification.innerHTML}</div>`)
  }

  syncLetterGuide(false)
})()
