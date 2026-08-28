/**
 * planning-admin.js
 * Logique de la page planning admin.
 *
 * Dépendances :
 *   - @supabase/supabase-js v2 (CDN)
 *   - js/supabase-config.js → db
 *   - js/admin-site.js → AdminSite, auth partagée
 *
 * window.ADMIN_PAGE et window.onAdminReady sont définis ici
 * et utilisés par admin-site.js.
 */

// ── Page active pour la nav admin ────────────────────────────────
window.ADMIN_PAGE = 'planning'

// ── Point d'entrée appelé par admin-site.js ───────────────────────
window.onAdminReady = async function () {
  // Ouverture automatique sur la bonne semaine si redirection depuis confirm-registration
  const urlParams = new URLSearchParams(window.location.search)
  const confirmDate = urlParams.get('date')
  if (confirmDate) {
    const target = new Date(confirmDate + 'T00:00:00')
    const diff = Math.round((target - TODAY) / (7 * 86400000))
    currentWeekOffset = Math.max(0, Math.min(4, Math.round(diff)))
  }
  await renderPage()

    // Ouvre automatiquement la modale si on vient d'une confirmation
  const regId = urlParams.get('reg')
  if (regId) {
    const btn = document.querySelector(`button[onclick*="${regId}"]`)
    if (btn) btn.click()
  }
}

// ── Constantes ────────────────────────────────────────────────────
const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })()
const DAYS_FR     = ['Lun','Mar','Mer','Jeu','Ven']
const MONTHS_FR   = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc']
const MONTHS_FULL = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
const DAYS_FULL   = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']

const ROLES = [
  // CDM : ajouté uniquement depuis planning-admin (pas de card publique sur
  // inscription.html, register.js rejette d'ailleurs ce rôle côté serveur).
  { id: 'cdm',       label: 'CDM',       quota: 1, time: '',                       isMaraude: false, isCdm: true },
  { id: 'cuisinier', label: 'Cuisiniers', quota: 5, time: '8h – 12h',             isMaraude: false },
  { id: 'maraudeur', label: 'Maraudeurs', quota: 4, time: '11h – début après-midi', isMaraude: true  },
]

// ── Helpers ───────────────────────────────────────────────────────
function getMonday(d) {
  const date = new Date(d), day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1); return date
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function localDateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function dayDiff(d) {
  return Math.round((new Date(localDateKey(d)) - new Date(localDateKey(TODAY))) / 86400000)
}
function initials(name) {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function escAttr(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;')
}

// ── Supabase helpers ──────────────────────────────────────────────
async function getSlotRegs(ds, roleId) {
  const { data } = await db
    .from('registrations')
    .select(`id, status, Confirm_token, first_time, volunteers ( id, nom, prenom, email, tel, permis )`)
    .eq('date', ds)
    .eq('role', roleId)
  return data || []
}

async function setSlotStatus(regId, newStatus) {
  await db.from('registrations').update({ status: newStatus }).eq('id', regId)
}

async function deleteReg(regId) {
  await db.from('registrations').delete().eq('id', regId)
}

async function addReg(ds, roleId, nom, prenom, email, tel, permis, status,
                      secu = '', profession = '', adresse = '', codepostal = '', ville = '',
                      urgenceContact = '', firstTime = false) {
  const { data: existing } = await db
    .from('volunteers').select('id').eq('email', email).maybeSingle()

  let volunteerId
  if (existing) {
    volunteerId = existing.id
  } else {
    const { data: newVol } = await db
      .from('volunteers')
      .insert({ nom, prenom, email, tel, permis, secu, profession, adresse, codepostal, ville,
                urgence_contact: urgenceContact, rgpd: true })
      .select('id').single()
    volunteerId = newVol.id
  }

  const token = crypto.randomUUID()
  await db.from('registrations').insert({
    volunteers_id: volunteerId, date: ds, role: roleId,
    status: status, Confirm_token: token, first_time: !!firstTime
  })
}

// ── État ──────────────────────────────────────────────────────────
let currentWeekOffset = parseInt(localStorage.getItem('miaa-admin-week') || '0')
if (isNaN(currentWeekOffset) || currentWeekOffset < 0 || currentWeekOffset > 4) currentWeekOffset = 0

let pendingAction     = null
let addTarget         = null
let addIsMaraude      = false
let addExtraData      = null
let editOriginalStatus = null
let lastFocusedTrigger = null

// ── Week helpers ──────────────────────────────────────────────────
function getWeekDays(offset) {
  const monday = getMonday(addDays(TODAY, offset * 7))
  return Array.from({ length: 5 }, (_, i) => addDays(monday, i))
}

async function changeWeek(dir) {
  currentWeekOffset = Math.max(0, Math.min(4, currentWeekOffset + dir))
  localStorage.setItem('miaa-admin-week', currentWeekOffset)
  await renderPage()
}

// ── Render ────────────────────────────────────────────────────────
async function renderPage() {
  const days = getWeekDays(currentWeekOffset)

  document.getElementById('btn-prev').disabled = currentWeekOffset === 0
  document.getElementById('btn-next').disabled = currentWeekOffset === 4

  const mon = days[0], ven = days[4]
  const sameMonth = mon.getMonth() === ven.getMonth()
  document.getElementById('week-label').innerHTML = sameMonth
    ? `<span class="week-prefix">Semaine </span><span>${mon.getDate()} au ${ven.getDate()} ${MONTHS_FULL[ven.getMonth()]} ${ven.getFullYear()}</span>`
    : `<span class="week-prefix">Semaine </span><span>${mon.getDate()} ${MONTHS_FULL[mon.getMonth()]} au ${ven.getDate()} ${MONTHS_FULL[ven.getMonth()]} ${ven.getFullYear()}</span>`

  document.getElementById('planning-grid').innerHTML =
    `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#888;font-size:14px">Chargement…</div>`

  const dateKeys = days.map(d => localDateKey(d))
  const { data: allRegs } = await db
    .from('registrations')
    .select(`id, date, role, status, Confirm_token, first_time, volunteers ( id, nom, prenom, email, tel, permis )`)
    .in('date', dateKeys)

  const regsData = allRegs || []

  let total = 0, confirmed = 0, pending = 0, spots = 0
  ROLES.forEach(role => {
    dateKeys.forEach(ds => {
      const slotRegs = regsData.filter(r => r.date === ds && r.role === role.id)
      total     += slotRegs.length
      confirmed += slotRegs.filter(r => r.status === 'confirmed').length
      pending   += slotRegs.filter(r => r.status === 'pending').length
      spots     += Math.max(0, role.quota - slotRegs.length)
    })
  })

  document.getElementById('stats-bar').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon blue"><i class="fas fa-users" aria-hidden="true"></i></div>
      <div><div class="stat-label">Total inscrits</div><div class="stat-val">${total}</div></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green"><i class="fas fa-check" aria-hidden="true"></i></div>
      <div><div class="stat-label">Confirmés</div><div class="stat-val">${confirmed}</div></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon orange"><i class="fas fa-clock" aria-hidden="true"></i></div>
      <div><div class="stat-label">En attente</div><div class="stat-val">${pending}</div></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon red"><i class="fas fa-chair" aria-hidden="true"></i></div>
      <div><div class="stat-label">Places libres</div><div class="stat-val">${spots}</div></div>
    </div>
  `

  let html = ''
  days.forEach((day, i) => {
    const ds          = localDateKey(day)
    const diff        = dayDiff(day)
    const isPast      = diff < 0
    const isToday     = diff === 0
    const dayVariant  = isPast ? 'past' : isToday ? 'today' : 'upcoming'
    const dayFullName = DAYS_FULL[day.getDay()]
    const monthFull   = MONTHS_FULL[day.getMonth()]
    const dateLabel   = `${dayFullName} ${day.getDate()} ${monthFull}`

    html += `<div class="day-col">`
    html += `<div class="miaa-day miaa-day--${dayVariant}">
      <h2 class="day-heading">
        <span class="miaa-day__name" aria-hidden="true">${DAYS_FR[i]}</span>
        <span class="sr-only">${dayFullName}</span>
        <span class="miaa-day__num">${day.getDate()}</span>
        <span class="miaa-day__month" aria-hidden="true">${MONTHS_FR[day.getMonth()]}</span>
        <span class="sr-only">${monthFull}</span>
      </h2>
    </div>`

    ROLES.forEach(role => {
      const regs      = regsData.filter(r => r.date === ds && r.role === role.id)
      const filled    = regs.length
      const remaining = role.quota - filled
      const isFull    = remaining <= 0
      const countMod  = isFull ? ' miaa-adminslot__count--full' : remaining <= 1 ? ' miaa-adminslot__count--warn' : ''
      const countTxt  = isFull ? 'Complet' : `${filled}/${role.quota}`

      html += `<div class="miaa-adminslot${isPast ? ' miaa-adminslot--past' : ''}">`
      if (role.isCdm) {
        // CDM : card réduite au strict nécessaire (pas d'horaire, pas de
        // badge de quota, pas de rangée de points).
        html += `<div class="miaa-adminslot__header">
          <div class="miaa-adminslot__info">
            <h3 class="miaa-adminslot__role">${escHtml(role.label)}</h3>
          </div>
        </div>`
      } else {
        html += `<div class="miaa-adminslot__header">
          <div class="miaa-adminslot__info">
            <h3 class="miaa-adminslot__role">${escHtml(role.label)}</h3>
            <span class="miaa-adminslot__time">${escHtml(role.time)}</span>
          </div>
          <span class="miaa-adminslot__count${countMod}">${countTxt}</span>
        </div>`

        html += `<div class="miaa-adminslot__dots" aria-hidden="true">`
        for (let s = 0; s < role.quota; s++) {
          if (s < filled) {
            const dotMod = regs[s].status === 'pending' ? ' miaa-dot--pending' : ' miaa-dot--taken'
            html += `<div class="miaa-dot${dotMod}"></div>`
          } else {
            html += `<div class="miaa-dot"></div>`
          }
        }
        html += `</div>`
      }

      html += `<div class="miaa-adminslot__list">`
      if (regs.length === 0) {
        html += `<div class="miaa-adminslot__empty">Aucune inscription</div>`
      } else {
        regs.forEach(reg => {
          if (!reg.volunteers) return
          const isPending   = reg.status === 'pending'
          const volMod      = isPending ? ' miaa-volunteer--pending' : ' miaa-volunteer--confirmed'
          const stTxt       = isPending ? 'En attente' : 'Confirmé'
          const permisBadge = role.isMaraude && reg.volunteers.permis
            ? `<span class="miaa-volunteer__permis"><i class="fas fa-car" aria-hidden="true"></i>Permis</span>`
            : ''
          const firstTimeBadge = reg.first_time
            ? `<span class="miaa-volunteer__firsttime"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i>1ere fois</span>`
            : ''
          const volNom = `${reg.volunteers.prenom || ''} ${reg.volunteers.nom || ''}`.trim()
          const identityLabel = escAttr(`Modifier l'inscription de ${volNom}, ${role.label.toLowerCase()}, ${dateLabel}`)
          const deleteLabel   = escAttr(`Supprimer l'inscription de ${volNom}`)

          html += `<div class="miaa-volunteer${volMod}">
            <button type="button" class="miaa-volunteer__identity-btn"
              onclick="openEdit('${ds}','${role.id}','${reg.id}',event)"
              aria-label="${identityLabel}">
              <span class="miaa-volunteer__avatar" aria-hidden="true">${initials(volNom || '?')}</span>
              <span class="miaa-volunteer__info">
                <span class="miaa-volunteer__name">${escHtml(volNom)}</span>
                <span class="miaa-volunteer__meta">${escHtml(reg.volunteers.tel)}</span>
                ${permisBadge}
                ${firstTimeBadge}
              </span>
            </button>
            <div class="miaa-volunteer__actions">
              <span class="miaa-volunteer__status">${stTxt}</span>
              <button type="button" class="miaa-volunteer__delete"
                aria-label="${deleteLabel}"
                onclick="openDelete('${ds}','${role.id}','${reg.id}',event)">
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          </div>`
        })
      }
      html += `</div>`

      if (!isPast) {
        const addLabel = escAttr(`Ajouter au créneau ${role.label.toLowerCase()}, ${dateLabel}`)
        if (regs.length > 0) html += `<hr class="miaa-adminslot__divider">`
        if (!isFull) {
          html += `<button class="miaa-add"
            data-date="${ds}" data-role="${role.id}"
            data-label="${escAttr(role.label)}" data-time="${escAttr(role.time)}"
            data-maraude="${role.isMaraude}"
            onclick="handleAdd(this)" aria-label="${addLabel}">
            <i class="fas fa-plus" aria-hidden="true"></i> Ajouter une personne
          </button>`
        } else {
          html += `<button class="miaa-add" disabled aria-disabled="true">Créneau complet</button>`
        }
      }
      html += `</div>`
    })
    html += `</div>`
  })

  document.getElementById('planning-grid').innerHTML = html
}

// ── handleAdd ─────────────────────────────────────────────────────
function handleAdd(btn) {
  const { date: ds, role: roleId, label: roleLabel, time: roleTime, maraude } = btn.dataset
  openAdd(ds, roleId, roleLabel, roleTime, maraude === 'true')
}

// ── Modal helpers ─────────────────────────────────────────────────
function handleOverlayClick(e, id) {
  if (e.target === document.getElementById(id)) closeModal(id)
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open')
  document.body.style.overflow = ''
  if (lastFocusedTrigger && typeof lastFocusedTrigger.focus === 'function') {
    setTimeout(() => { try { lastFocusedTrigger.focus() } catch(e) {} }, 50)
  }
}
function openModalEl(id) {
  lastFocusedTrigger = document.activeElement
  document.getElementById(id).classList.add('open')
  document.body.style.overflow = 'hidden'
}
function getFocusable(node) {
  return Array.from(node.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(el => {
    if (el.closest('[style*="display:none"], [style*="display: none"]')) return false
    return el.offsetParent !== null || el === document.activeElement
  })
}

// ── Modifier une inscription ──────────────────────────────────────
async function openEdit(dateStr, roleId, regId, event) {
  if (event) event.stopPropagation()
  const regs = await getSlotRegs(dateStr, roleId)
  const reg  = regs.find(r => String(r.id) === String(regId))
  if (!reg) return

  pendingAction      = { type: 'edit', dateStr, roleId, regId }
  editOriginalStatus = reg.status

  const role = ROLES.find(r => r.id === roleId)
  const volNom = `${reg.volunteers.prenom || ''} ${reg.volunteers.nom || ''}`.trim()
  document.getElementById('edit-modal-sub').textContent          = role.time ? `${role.label} · ${role.time}` : role.label
  document.getElementById('edit-nom').value                      = reg.volunteers.nom || '—'
  document.getElementById('edit-prenom').value                   = reg.volunteers.prenom || '—'
  document.getElementById('edit-tel').value                      = reg.volunteers.tel    || '—'
  document.getElementById('edit-email').value                    = reg.volunteers.email  || '—'
  document.getElementById('edit-status').value                   = reg.status
  document.getElementById('edit-permis-display').style.display   = role.isMaraude && reg.volunteers.permis ? 'flex' : 'none'

  const saveBtn     = document.getElementById('edit-save-btn')
  const statusGroup = document.getElementById('edit-status-group')
  if (reg.status === 'pending') {
    saveBtn.innerHTML         = '<i class="fas fa-check"></i>Confirmer'
    saveBtn.disabled          = false
    statusGroup.style.display = 'none'
  } else {
    saveBtn.innerHTML         = '<i class="fas fa-save"></i>Enregistrer'
    saveBtn.disabled          = true
    statusGroup.style.display = 'block'
  }

  document.getElementById('edit-status').addEventListener('change', checkEditChanges)
  openModalEl('modal-edit')
}

function checkEditChanges() {
  const newStatus = document.getElementById('edit-status').value
  document.getElementById('edit-save-btn').disabled =
    editOriginalStatus !== 'pending' && newStatus === editOriginalStatus
}

async function saveEdit() {
  const { dateStr, roleId, regId } = pendingAction
  const regs = await getSlotRegs(dateStr, roleId)
  const reg  = regs.find(r => String(r.id) === String(regId))
  if (!reg) return

  const newStatus = editOriginalStatus === 'pending'
    ? 'confirmed'
    : document.getElementById('edit-status').value

  await setSlotStatus(regId, newStatus)
  document.getElementById('edit-status').removeEventListener('change', checkEditChanges)
  closeModal('modal-edit')
  await renderPage()
  const volNom = `${reg.volunteers.prenom || ''} ${reg.volunteers.nom || ''}`.trim()
  showToast('green', editOriginalStatus === 'pending' ? `${volNom} confirmé(e).` : 'Informations mises à jour.')
}

function deleteFromEdit() {
  document.getElementById('edit-status').removeEventListener('change', checkEditChanges)
  closeModal('modal-edit')
  const { dateStr, roleId, regId } = pendingAction
  openDelete(dateStr, roleId, regId)
}

// ── Ajouter une personne ──────────────────────────────────────────
function openAdd(dateStr, roleId, roleLabel, roleTime, isMaraude) {
  addTarget    = { dateStr, roleId }
  addIsMaraude = isMaraude
  document.getElementById('add-modal-sub').textContent      = roleTime ? `${roleLabel} · ${roleTime}` : roleLabel
  document.getElementById('add-permis-group').style.display = isMaraude ? 'block' : 'none'

  ;['add-nom', 'add-prenom', 'add-tel', 'add-email'].forEach(id => {
    const el = document.getElementById(id)
    el.value = ''
    el.classList.remove('autocompleted')
    el.setAttribute('aria-invalid', 'false')
  })
  ;['add-err-nom','add-err-prenom','add-err-tel','add-err-email'].forEach(id => {
    document.getElementById(id).style.display = 'none'
  })
  document.getElementById('add-permis').checked    = false
  document.getElementById('add-firsttime').checked = false
  document.getElementById('add-status').value      = 'confirmed'

  openModalEl('modal-add')
  setTimeout(() => document.getElementById('add-email').focus(), 120)

  // Autocomplétion depuis la base bénévoles
  initAddEmailAutocomplete()
}

function initAddEmailAutocomplete () {
  const emailInput = document.getElementById('add-email')
  // Retire l'ancien listener s'il existe
  const newInput = emailInput.cloneNode(true)
  emailInput.parentNode.replaceChild(newInput, emailInput)

  newInput.addEventListener('blur', async () => {
    const email = newInput.value.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return

    document.getElementById('add-email-loading').style.display = 'inline'

    const { data: vol } = await db
      .from('volunteers')
      .select('nom, prenom, tel, permis')
      .eq('email', email)
      .maybeSingle()

    document.getElementById('add-email-loading').style.display = 'none'

    if (vol) {
      document.getElementById('add-nom').value    = vol.nom    || ''
      document.getElementById('add-prenom').value = vol.prenom || ''
      document.getElementById('add-tel').value    = vol.tel    || ''
      if (addIsMaraude) document.getElementById('add-permis').checked = vol.permis || false
      ;['add-nom','add-prenom','add-tel'].forEach(id => {
        document.getElementById(id).classList.add('autocompleted')
      })
    }
  })
}

async function submitAdd() {
  const nom       = document.getElementById('add-nom').value.trim()
  const prenom    = document.getElementById('add-prenom').value.trim()
  const tel       = document.getElementById('add-tel').value.trim()
  const email     = document.getElementById('add-email').value.trim()
  const status    = document.getElementById('add-status').value
  const permis    = document.getElementById('add-permis').checked
  const firstTime = document.getElementById('add-firsttime').checked

  let valid = true, firstInvalid = null
  const checks = [
    { ok: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), errId: 'add-err-email', inputId: 'add-email' },
    { ok: nom.length > 0,                            errId: 'add-err-nom',   inputId: 'add-nom'   },
    { ok: prenom.length > 0,                         errId: 'add-err-prenom',inputId: 'add-prenom' },
    { ok: tel.length > 0,                            errId: 'add-err-tel',   inputId: 'add-tel'   },
  ]
  checks.forEach(c => {
    const errEl = document.getElementById(c.errId)
    const inpEl = document.getElementById(c.inputId)
    errEl.style.display = c.ok ? 'none' : 'block'
    inpEl.classList[c.ok ? 'remove' : 'add']('error')
    inpEl.setAttribute('aria-invalid', c.ok ? 'false' : 'true')
    if (!c.ok) { valid = false; if (!firstInvalid) firstInvalid = inpEl }
  })
  if (!valid) { if (firstInvalid) firstInvalid.focus(); return }

  const { data: existing } = await db
    .from('volunteers').select('id').eq('email', email).maybeSingle()

  if (existing) {
    try {
      await addReg(addTarget.dateStr, addTarget.roleId, nom, prenom, email, tel, permis, status,
        '', '', '', '', '', '', firstTime)
      closeModal('modal-add')
      await renderPage()
      showToast('green', `${nom} ajouté(e) au créneau.`)
    } catch (err) {
      console.error(err)
      showToast('red', 'Une erreur est survenue, merci de réessayer.')
    }
  } else {
    closeModal('modal-add')
    openAddExtra(nom, prenom, email, tel, permis, status, firstTime)
  }
}

function openAddExtra(nom, prenom, email, tel, permis, status, firstTime) {
  addExtraData = { nom, prenom, email, tel, permis, status, firstTime }
  document.getElementById('add-extra-tag-date').textContent = document.getElementById('add-modal-sub').textContent
  ;['add-extra-secu','add-extra-profession','add-extra-adresse','add-extra-codepostal','add-extra-ville',
    'add-extra-urgence-nom','add-extra-urgence-tel'].forEach(id => {
    document.getElementById(id).value = ''
  })
  document.getElementById('add-extra-rgpd').checked           = false
  document.getElementById('add-extra-err-secu').style.display = 'none'
  document.getElementById('btn-confirm-add-extra').disabled   = true

  // Permis : pré-rempli depuis la modale principale (utile si déjà coché pour
  // la maraude), reste modifiable — c'est cette valeur qui sera enregistrée.
  document.getElementById('add-extra-permis').checked = document.getElementById('add-permis').checked

  openModalEl('modal-add-extra')
}

function closeAddExtra() {
  document.getElementById('modal-add-extra').classList.remove('open')
  document.body.style.overflow = ''
}

function backToAddModal() {
  document.getElementById('modal-add-extra').classList.remove('open')
  openModalEl('modal-add')
}

function handleRgpdChangeAddExtra() {
  document.getElementById('btn-confirm-add-extra').disabled =
    !document.getElementById('add-extra-rgpd').checked
}

async function submitAddExtra() {
  const secu       = document.getElementById('add-extra-secu').value.trim()
  const urgenceNom = document.getElementById('add-extra-urgence-nom').value.trim()
  const urgenceTel = document.getElementById('add-extra-urgence-tel').value.trim()
  // Optionnel : n'assemble que les parties renseignées (évite un " / " vide)
  const urgenceContact = [urgenceNom, urgenceTel].filter(Boolean).join(' / ')
  const profession = document.getElementById('add-extra-profession').value.trim()
  const adresse    = document.getElementById('add-extra-adresse').value.trim()
  const codepostal = document.getElementById('add-extra-codepostal').value.trim()
  const ville      = document.getElementById('add-extra-ville').value.trim()
  // Valeur de la modale complémentaire = valeur finale enregistrée (voir openAddExtra)
  const permis     = document.getElementById('add-extra-permis').checked

  let valid = true
  if (!secu) {
    document.getElementById('add-extra-err-secu').style.display = 'block'; valid = false
  } else {
    document.getElementById('add-extra-err-secu').style.display = 'none'
  }
  if (!valid) return

  const btn = document.getElementById('btn-confirm-add-extra')
  btn.disabled = true; btn.textContent = 'Ajout en cours…'

  try {
    await addReg(addTarget.dateStr, addTarget.roleId,
      addExtraData.nom, addExtraData.prenom, addExtraData.email, addExtraData.tel, permis, addExtraData.status,
      secu, profession, adresse, codepostal, ville, urgenceContact, addExtraData.firstTime)
    closeAddExtra()
    await renderPage()
    showToast('green', `${addExtraData.nom} ajouté(e) au créneau.`)
  } catch(err) {
    console.error(err)
    btn.disabled = false; btn.textContent = 'Confirmer'
    showToast('red', 'Une erreur est survenue, merci de réessayer.')
  }
}

function handleOverlayClickAddExtra(e) {
  if (e.target === document.getElementById('modal-add-extra')) closeAddExtra()
}

// ── Supprimer une inscription ─────────────────────────────────────
async function openDelete(dateStr, roleId, regId, event) {
  if (event) event.stopPropagation()
  const regs = await getSlotRegs(dateStr, roleId)
  const reg  = regs.find(r => String(r.id) === String(regId))
  if (!reg) return
  if (!reg.volunteers) return

  pendingAction = { type: 'delete', dateStr, roleId, regId }
  const role = ROLES.find(r => r.id === roleId)
  document.getElementById('del-modal-sub').textContent    = role.time ? `${role.label} · ${role.time}` : role.label
  document.getElementById('del-person-info').innerHTML    = personInfoHTML(reg, role.isMaraude)
  document.getElementById('del-warning-text').textContent = reg.status === 'pending'
    ? "Cette personne sera supprimée et notifiée que sa demande n'a pas été retenue."
    : "Cette action est irréversible. La personne sera notifiée par email de l'annulation."
  openModalEl('modal-delete')
}

async function confirmDelete() {
  const { dateStr, roleId, regId } = pendingAction
  const regs = await getSlotRegs(dateStr, roleId)
  const reg  = regs.find(r => String(r.id) === String(regId))

  await deleteReg(regId)
  closeModal('modal-delete')
  await renderPage()

  // Affiche la modale de confirmation au lieu d'ouvrir Gmail
  if (reg && reg.volunteers) {
    const volNom = `${reg.volunteers.prenom || ''} ${reg.volunteers.nom || ''}`.trim()
    document.getElementById('delete-confirm-name').textContent = volNom
    document.getElementById('delete-confirm-email').textContent = reg.volunteers.email || ''
    document.getElementById('modal-delete-confirm').classList.add('open')
    document.body.style.overflow = 'hidden'
  }
}

function personInfoHTML(reg, isMaraude) {
  const volNom = `${reg.volunteers.prenom || ''} ${reg.volunteers.nom || ''}`.trim()
  return `
    <div class="pib-row"><i class="fas fa-user" aria-hidden="true"></i><strong>${escHtml(volNom)}</strong></div>
    <div class="pib-row"><i class="fas fa-phone" aria-hidden="true"></i>${escHtml(reg.volunteers.tel)}</div>
    <div class="pib-row"><i class="fas fa-envelope" aria-hidden="true"></i>${escHtml(reg.volunteers.email)}</div>
    ${isMaraude && reg.volunteers.permis ? '<div class="pib-row"><i class="fas fa-car" aria-hidden="true"></i>Possède le permis</div>' : ''}
    <div class="pib-row"><i class="fas fa-circle" aria-hidden="true"
      style="color:${reg.status==='confirmed'?'#27ae60':'#bb5c03'};font-size:8px"></i>
      ${reg.status==='confirmed' ? 'Confirmé' : 'En attente de validation'}
    </div>
  `
}

// ── Toast ─────────────────────────────────────────────────────────
let toastTimer = null
function showToast(type, msg) {
  const el    = document.getElementById('toast')
  const msgEl = document.getElementById('toast-msg')
  msgEl.textContent = ''
  el.className = `toast toast-${type}`
  requestAnimationFrame(() => { msgEl.textContent = msg; el.classList.add('show') })
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.classList.remove('show') }, 3000)
}

// ── Clavier ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const openId = ['modal-add','modal-delete','modal-edit','modal-add-extra'].find(id =>
    document.getElementById(id)?.classList.contains('open')
  )
  if (!openId) return

  if (e.key === 'Escape') { closeModal(openId); return }

  if (e.key === 'Tab') {
    const modal      = document.getElementById(openId).querySelector('.modal')
    const focusables = getFocusable(modal)
    if (!focusables.length) return
    const first = focusables[0], last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus()
    }
  }
})
