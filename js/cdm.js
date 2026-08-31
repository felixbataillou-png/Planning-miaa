/**
 * cdm.js
 * Logique de la page espace CDM (cdm.html).
 *
 * Vue très proche de planning-admin.js (mêmes composants visuels), mais :
 *   - Lecture via les vues à colonnes restreintes volunteers_basic /
 *     registrations_for_planning (jamais la table volunteers en direct :
 *     ni email, ni secu, ni adresse, ni profession, ni urgence_contact,
 *     ni Confirm_token ne sont exposés ici).
 *   - Aucun ajout / suppression / changement de statut.
 *   - Écriture uniquement via la fonction RPC update_registration_extra,
 *     limitée à note / repas / nombre / info_jour.
 *
 * Dépendances :
 *   - @supabase/supabase-js v2 (CDN)
 *   - js/supabase-config.js → db
 *   - js/cdm-site.js        → CdmSite, auth partagée
 */

// ── Point d'entrée appelé par cdm-site.js ──────────────────────────
window.onCdmReady = async function () {
  await renderPage()
}

// ── Constantes ────────────────────────────────────────────────────
const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })()
const DAYS_FR     = ['Lun','Mar','Mer','Jeu','Ven']
const MONTHS_FR   = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc']
const MONTHS_FULL = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
const DAYS_FULL   = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']

const ROLES = [
  { id: 'cdm',       label: 'CDM',       quota: 1, time: '',                       isMaraude: false, isCdm: true },
  { id: 'cuisinier', label: 'Cuisiniers', quota: 5, time: '8h – 12h',             isMaraude: false },
  { id: 'maraudeur', label: 'Maraudeurs', quota: 4, time: '11h – début après-midi', isMaraude: true  },
]

// Champs du dropdown "Information" (card CDM) — ordre d'affichage = ordre
// du tableau. Identique à js/planning-admin.js (les deux pages partagent
// le même dropdown) : toute modification doit être répercutée dans les
// deux fichiers.
const DAY_INFO_FIELDS = [
  { key: 'nombre',    label: 'Nombre',       type: 'number'   },
  { key: 'repas',     label: 'Repas',        type: 'textarea' },
  { key: 'info_jour', label: 'Info du jour', type: 'textarea' },
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

/** Sauvegarde la note (par inscription) via la fonction RPC dédiée. */
async function updateRegistrationNote(regId, note) {
  return db.rpc('update_registration_note', { p_registration_id: regId, p_note: note })
}

/** Charge repas/nombre/info_jour pour un lot de dates (indépendant de la
 * présence d'un CDM inscrit — voir day_info_for_planning). */
async function loadDayInfo(dateKeys) {
  const { data } = await db
    .from('day_info_for_planning')
    .select('date, repas, nombre, info_jour')
    .in('date', dateKeys)
  return Object.fromEntries((data || []).map(d => [d.date, d]))
}

/** Sauvegarde un champ de day_info (repas/nombre/info_jour) pour une date,
 * via la fonction RPC dédiée. `field` est directement une clé de
 * DAY_INFO_FIELDS. */
async function saveDayInfoField(date, field, value) {
  const args = { p_date: date, p_repas: null, p_nombre: null, p_info_jour: null }
  args[`p_${field}`] = value
  return db.rpc('upsert_day_info', args)
}

async function saveDayInfoFieldFromInput(el, date, field) {
  try {
    await saveDayInfoField(date, field, el.value.trim())
  } catch (err) {
    console.error(err)
    showToast('red', "Une erreur est survenue lors de l'enregistrement.")
  }
}

/** Fait grandir/rétrécir un textarea pour s'ajuster à son contenu. */
function autoResizeTextarea(el) {
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

/** Charge les inscriptions de la semaine (vue restreinte) + les infos de
 * base des bénévoles concernés (vue volunteers_basic), puis les assemble
 * pour retrouver la même forme que planning-admin.js (reg.volunteers.*). */
async function loadWeekRegs(dateKeys) {
  const { data: regs } = await db
    .from('registrations_for_planning')
    .select('id, date, role, status, first_time, new_volunteer, note, volunteers_id')
    .in('date', dateKeys)

  const regsData = regs || []
  const volIds = [...new Set(regsData.map(r => r.volunteers_id).filter(Boolean))]

  let volMap = {}
  if (volIds.length > 0) {
    const { data: vols } = await db
      .from('volunteers_basic')
      .select('id, nom, prenom, tel, permis')
      .in('id', volIds)
    volMap = Object.fromEntries((vols || []).map(v => [v.id, v]))
  }

  return regsData.map(r => ({ ...r, volunteers: volMap[r.volunteers_id] || null }))
}

// ── État ──────────────────────────────────────────────────────────
let currentWeekOffset = parseInt(localStorage.getItem('miaa-cdm-week') || '0')
if (isNaN(currentWeekOffset) || currentWeekOffset < 0 || currentWeekOffset > 4) currentWeekOffset = 0

let viewRegId = null // inscription actuellement ouverte dans modal-cdm-view
let viewOriginalNote = null
let lastRegsData = [] // dernier jeu de données chargé par renderPage (évite une requête au clic)

// ── Week helpers ──────────────────────────────────────────────────
function getWeekDays(offset) {
  const monday = getMonday(addDays(TODAY, offset * 7))
  return Array.from({ length: 5 }, (_, i) => addDays(monday, i))
}

async function changeWeek(dir) {
  currentWeekOffset = Math.max(0, Math.min(4, currentWeekOffset + dir))
  localStorage.setItem('miaa-cdm-week', currentWeekOffset)
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
  const regsData = await loadWeekRegs(dateKeys)
  lastRegsData = regsData
  const dayInfoMap = await loadDayInfo(dateKeys)

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

  

  let html = ''
  days.forEach((day, i) => {
    const ds          = localDateKey(day)
    const diff        = dayDiff(day)
    const isPast      = diff < 0
    const isToday     = diff === 0
    const dayVariant  = isPast ? 'past' : isToday ? 'today' : 'upcoming'
    const dayFullName = DAYS_FULL[day.getDay()]
    const monthFull   = MONTHS_FULL[day.getMonth()]

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
        // Pour le CDM, aucun texte "Aucune inscription" (cohérent avec
        // planning-admin) ; pour les autres rôles, centré verticalement
        // puisqu'aucun CTA ne suit sur cette page (voir css/cdm.css).
        if (!role.isCdm) html += `<div class="miaa-adminslot__empty">Aucune inscription</div>`
      } else {
        regs.forEach(reg => {
          if (!reg.volunteers) return
          const isPending = reg.status === 'pending'
          const volMod    = isPending ? ' miaa-volunteer--pending' : ' miaa-volunteer--confirmed'
          const stTxt     = isPending ? 'En attente' : 'Confirmé'
          const permisBadge = role.isMaraude && reg.volunteers.permis
            ? `<span class="miaa-volunteer__permis"><i class="fas fa-car" aria-hidden="true"></i>Permis</span>`
            : ''
          const firstTimeBadge = reg.first_time
            ? `<span class="miaa-volunteer__firsttime"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i>1ere fois</span>`
            : ''
          const noteDisplay = reg.note
            ? `<span class="miaa-volunteer__note">${escHtml(reg.note)}</span>`
            : ''
          const volNom = `${reg.volunteers.prenom || ''} ${reg.volunteers.nom || ''}`.trim()
          const identityLabel = escAttr(`Voir les informations de ${volNom}, ${role.label.toLowerCase()}`)

          html += `<div class="miaa-volunteer${volMod}">
            <button type="button" class="miaa-volunteer__identity-btn"
              onclick="openCdmView('${reg.id}',event)"
              aria-label="${identityLabel}">
              <span class="miaa-volunteer__avatar" aria-hidden="true">${initials(volNom || '?')}</span>
              <span class="miaa-volunteer__info">
                <span class="miaa-volunteer__name">${escHtml(volNom)}</span>
                <span class="miaa-volunteer__meta">${escHtml(reg.volunteers.tel)}</span>
                ${permisBadge}
                ${firstTimeBadge}
                ${noteDisplay}
              </span>
            </button>
            <div class="miaa-volunteer__actions">
              <span class="miaa-volunteer__status">${stTxt}</span>
            </div>
          </div>`
        })
      }
      html += `</div>`

      if (role.isCdm) {
        // Toujours visible/éditable, qu'un CDM soit inscrit ou non.
        html += `<hr class="miaa-adminslot__divider">`
        html += cdmInfoDropdownHTML(ds, dayInfoMap[ds])
      }
      html += `</div>`
    })
    html += `</div>`
  })

  document.getElementById('planning-grid').innerHTML = html
}

// ── Modale : informations bénévole + note ──────────────────────────
function openCdmView(regId, event) {
  if (event) event.stopPropagation()
  const reg = lastRegsData.find(r => String(r.id) === String(regId))
  if (!reg || !reg.volunteers) return

  const role = ROLES.find(r => r.id === reg.role)

  viewRegId = regId
  viewOriginalNote = reg.note || ''

  document.getElementById('cdm-view-sub').textContent    = role ? role.label : ''
  document.getElementById('cdm-view-nom').value          = reg.volunteers.nom    || '—'
  document.getElementById('cdm-view-prenom').value       = reg.volunteers.prenom || '—'
  document.getElementById('cdm-view-tel').value          = reg.volunteers.tel    || '—'
  document.getElementById('edit-permis-display').style.display   = reg.volunteers.permis ? 'flex' : 'none'
  document.getElementById('cdm-view-note').value         = viewOriginalNote
  document.getElementById('cdm-view-save-btn').disabled  = true

  document.getElementById('cdm-view-note').removeEventListener('input', checkCdmViewChanges)
  document.getElementById('cdm-view-note').addEventListener('input', checkCdmViewChanges)

  openModalEl('modal-cdm-view')
}

function checkCdmViewChanges() {
  const newNote = document.getElementById('cdm-view-note').value
  document.getElementById('cdm-view-save-btn').disabled = newNote === viewOriginalNote
}

async function saveCdmNote() {
  const note = document.getElementById('cdm-view-note').value
  const btn  = document.getElementById('cdm-view-save-btn')
  btn.disabled = true; const original = btn.innerHTML; btn.innerHTML = 'Enregistrement…'
  try {
    await updateRegistrationNote(viewRegId, note)
    closeModal('modal-cdm-view')
    await renderPage()
    showToast('green', 'Note enregistrée.')
  } catch (err) {
    console.error(err)
    showToast('red', 'Une erreur est survenue, merci de réessayer.')
    btn.innerHTML = original
  }
}

// ── Dropdown "Information" (card CDM) — identique à planning-admin.js ──
// Rattaché à la date (pas à une inscription) : visible/éditable même sans
// CDM inscrit. Enregistrement automatique à la perte de focus.
function cdmInfoDropdownHTML(date, info) {
  info = info || {}
  const id = escAttr(date)
  const fieldsHtml = DAY_INFO_FIELDS.map(f => dayInfoFieldHTML(f, id, info[f.key])).join('')
  return `
    <div class="miaa-dropdown" id="cdm-dropdown-${id}">
      <button type="button" class="miaa-dropdown__toggle" onclick="toggleCdmDropdown('${id}')"
        aria-expanded="false" aria-controls="cdm-panel-${id}">
        <span>Information</span>
        <i class="fas fa-chevron-down" aria-hidden="true"></i>
      </button>
      <div class="miaa-dropdown__panel" id="cdm-panel-${id}">
        ${fieldsHtml}
      </div>
    </div>
  `
}

/** Génère le markup d'un champ du dropdown à partir de sa config (voir
 * DAY_INFO_FIELDS) — identique à planning-admin.js. */
function dayInfoFieldHTML(field, date, value) {
  const elId  = `cdm-${field.key}-${date}`
  const blur  = `saveDayInfoFieldFromInput(this,'${date}','${field.key}')`
  const input = field.type === 'textarea'
    ? `<textarea id="${elId}" rows="1" oninput="autoResizeTextarea(this)"
        onblur="${blur}">${escHtml(value || '')}</textarea>`
    : `<input type="${field.type}" inputmode="numeric" id="${elId}" value="${escAttr(value || '')}"
        onblur="${blur}">`
  return `
        <div class="miaa-dropdown__field">
          <label for="${elId}">${escHtml(field.label)}</label>
          ${input}
        </div>`
}

function toggleCdmDropdown(date) {
  const dropdown = document.getElementById(`cdm-dropdown-${date}`)
  if (!dropdown) return
  const nowOpen = dropdown.classList.toggle('open')
  const toggle = dropdown.querySelector('.miaa-dropdown__toggle')
  if (toggle) toggle.setAttribute('aria-expanded', nowOpen)
  if (nowOpen) dropdown.querySelectorAll('textarea').forEach(autoResizeTextarea)
}

// ── Modal helpers ─────────────────────────────────────────────────
function handleOverlayClick(e, id) {
  if (e.target === document.getElementById(id)) closeModal(id)
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open')
  document.body.style.overflow = ''
}
function openModalEl(id) {
  document.getElementById(id).classList.add('open')
  document.body.style.overflow = 'hidden'
}

// ── Toast (léger, sans dépendance à admin-site.js) ──────────────────
let toastTimer = null
function showToast(type, msg) {
  let el = document.getElementById('toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'toast'
    el.className = 'toast'
    el.setAttribute('role', 'alert')
    el.setAttribute('aria-live', 'assertive')
    el.setAttribute('aria-atomic', 'true')
    el.innerHTML = '<i class="fas fa-check-circle" aria-hidden="true"></i><span id="toast-msg"></span>'
    document.body.appendChild(el)
  }
  const msgEl = document.getElementById('toast-msg')
  msgEl.textContent = ''
  el.className = `toast toast-${type}`
  requestAnimationFrame(() => { msgEl.textContent = msg; el.classList.add('show') })
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.classList.remove('show') }, 3000)
}

// ── Clavier ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const openId = document.getElementById('modal-cdm-view')?.classList.contains('open') ? 'modal-cdm-view' : null
  if (!openId) return
  if (e.key === 'Escape') closeModal(openId)
})
