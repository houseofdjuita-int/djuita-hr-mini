(() => {
  const form = document.getElementById('requestForm')
  const employee = document.getElementById('employee')
  const type = document.getElementById('letterType')
  const start = document.getElementById('startDate')
  const end = document.getElementById('endDate')
  const startedAt = Date.now()
  let staff = []
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
  const formatDate = value => new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const nextDate = value => { const date = new Date(`${value}T00:00:00`); date.setDate(date.getDate() + 1); return date.toISOString().slice(0, 10) }
  const syncType = () => {
    const early = type.value === 'Izin Pulang Lebih Awal'
    document.getElementById('endField').style.display = early ? 'none' : 'block'
    document.getElementById('earlyTimeField').style.display = early ? 'block' : 'none'
    document.getElementById('leaveCategoryField').style.display = type.value === 'Pemberitahuan Cuti SPG' ? 'block' : 'none'
    document.getElementById('replacementFields').style.display = early ? 'none' : 'block'
    if (early) end.value = start.value
  }
  const syncReplacement = () => {
    const external = document.getElementById('replacementMode').value === 'external'
    document.getElementById('registeredReplacementField').style.display = external ? 'none' : 'block'
    document.getElementById('externalReplacementField').style.display = external ? 'block' : 'none'
  }
  const syncReplacementOptions = () => {
    const current = employee.value
    document.getElementById('replacementStaff').innerHTML = '<option value="">Pilih SPG pengganti</option>' + staff.filter(item => item.id !== current).map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.full_name)} · ${escapeHtml(item.store)}</option>`).join('')
  }
  const detail = () => {
    const shift = document.getElementById('shift').value
    if (type.value === 'Izin Pulang Lebih Awal') return `Shift kerja: ${shift}\nJam izin pulang: ${document.getElementById('earlyTime').value.replace(':', '.')} WIB\nJam pulang normal: ${shift === 'Pagi' ? '17.00' : '21.00'} WIB`
    const days = Math.round((new Date(`${end.value}T00:00:00`) - new Date(`${start.value}T00:00:00`)) / 86400000) + 1
    const period = `${formatDate(start.value)} s.d. ${formatDate(end.value)}`
    if (type.value === 'Pemberitahuan Cuti SPG') return `Shift: ${shift}\nDurasi cuti: ${days} hari\nPeriode cuti: ${period}\nJenis cuti: ${document.getElementById('leaveCategory').value}\nKembali bekerja: ${formatDate(nextDate(end.value))}`
    if (type.value === 'Pemberitahuan Libur / Off SPG') return `Shift: ${shift}\nDurasi libur/off: ${days} hari\nPeriode libur/off: ${period}\nKembali bekerja: ${formatDate(nextDate(end.value))}`
    return `Shift: ${shift}\nDurasi izin: ${days} shift\nPeriode izin: ${period}\nKembali bekerja: ${formatDate(nextDate(end.value))}`
  }
  const show = (text, error = false) => { const box = document.getElementById('message'); box.className = `message show ${error ? 'error' : 'success'}`; box.textContent = text }
  fetch('/api/public-request').then(response => response.json()).then(payload => {
    staff = payload.staff || []
    employee.innerHTML = '<option value="">Pilih nama Anda</option>' + staff.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.full_name)} · ${escapeHtml(item.store)}</option>`).join('')
    syncReplacementOptions()
  }).catch(() => { employee.innerHTML = '<option value="">Daftar SPG gagal dimuat</option>'; show('Daftar SPG belum dapat dimuat. Silakan coba lagi.', true) })
  const today = new Date().toISOString().slice(0, 10); start.value = today; end.value = today
  start.addEventListener('change', () => { if (!end.value || end.value < start.value) end.value = start.value; syncType() })
  employee.addEventListener('change', syncReplacementOptions)
  document.getElementById('replacementMode').addEventListener('change', syncReplacement)
  type.addEventListener('change', syncType); syncType(); syncReplacement()
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = document.getElementById('submitButton')
    if (end.value < start.value) return show('Tanggal selesai tidak boleh sebelum tanggal mulai.', true)
    button.disabled = true; button.textContent = 'Mengirim…'
    try {
      const replacementMode = document.getElementById('replacementMode').value
      const response = await fetch('/api/public-request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employeeId: employee.value, nik: document.getElementById('nik').value, letterType: type.value, startDate: start.value, endDate: type.value === 'Izin Pulang Lebih Awal' ? start.value : end.value, shift: document.getElementById('shift').value, detail: detail(), reason: document.getElementById('reason').value, replacementMode, replacementStaffId: replacementMode === 'registered' ? document.getElementById('replacementStaff').value : '', replacementName: replacementMode === 'external' ? document.getElementById('replacementName').value : '', website: document.getElementById('website').value, startedAt }) })
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Pengajuan gagal dikirim')
      form.reset(); show(`Permohonan berhasil dikirim. Nomor referensi: ${payload.reference}. Simpan nomor ini.`); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    } catch (error) { show(error.message, true) } finally { button.disabled = false; button.textContent = 'Kirim permohonan' }
  })
})()
