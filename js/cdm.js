/**
 * cdm.js
 * Logique de la page espace CDM (cdm.html).
 *
 * Réutilise les mêmes composants visuels que planning-admin.js (.miaa-day,
 * .miaa-adminslot__*, .miaa-volunteer…), mais dans une mise en page propre à
 * cette page : un jour à la fois (sélecteur de jour ci-dessus, navigation
 * par semaine inchangée) plutôt que les 5 jours en colonnes, avec CDM /
 * cuisiniers / maraudeurs en lignes horizontales (voir renderDayPanel).
 *
 * Autres différences avec planning-admin.js :
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
  activeDayIndex = pickDefaultDayIndex(getWeekDays(currentWeekOffset))
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

// Champs repas/nombre/info_jour : affichés en ligne (pas de dropdown, voir
// renderDayPanel) — clés day_info identiques à js/planning-admin.js, qui les
// affiche lui via un dropdown replié (voir DAY_INFO_FIELDS là-bas).

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
 * via la fonction RPC dédiée. `field` est 'nombre' | 'repas' | 'info_jour'. */
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

let activeDayIndex  = 0  // jour affiché dans le panneau (0=Lundi … 4=Vendredi)
let viewRegId = null // inscription actuellement ouverte dans modal-cdm-view
let viewOriginalNote = null
let lastWeekDays   = [] // jours de la semaine actuellement chargée
let lastRegsData   = [] // dernier jeu de données chargé par renderPage (évite une requête au clic)
let lastDayInfoMap = {}

// ── Week helpers ──────────────────────────────────────────────────
function getWeekDays(offset) {
  const monday = getMonday(addDays(TODAY, offset * 7))
  return Array.from({ length: 5 }, (_, i) => addDays(monday, i))
}

/** Jour actif par défaut à l'arrivée sur une semaine : aujourd'hui s'il en
 * fait partie, sinon le premier jour à venir (le lundi pour une semaine
 * entièrement à venir), sinon (semaine entièrement passée) le lundi. */
function pickDefaultDayIndex(days) {
  const idxToday = days.findIndex(d => dayDiff(d) === 0)
  if (idxToday !== -1) return idxToday
  const idxUpcoming = days.findIndex(d => dayDiff(d) > 0)
  if (idxUpcoming !== -1) return idxUpcoming
  return 0
}

async function changeWeek(dir) {
  currentWeekOffset = Math.max(0, Math.min(4, currentWeekOffset + dir))
  localStorage.setItem('miaa-cdm-week', currentWeekOffset)
  activeDayIndex = pickDefaultDayIndex(getWeekDays(currentWeekOffset))
  await renderPage()
}

function selectDay(index) {
  activeDayIndex = index
  renderDaySelector()
  renderDayPanel()
}

// ── Render ────────────────────────────────────────────────────────
async function renderPage() {
  const days = getWeekDays(currentWeekOffset)
  lastWeekDays = days

  document.getElementById('btn-prev').disabled = currentWeekOffset === 0
  document.getElementById('btn-next').disabled = currentWeekOffset === 4

  const mon = days[0], ven = days[4]
  const sameMonth = mon.getMonth() === ven.getMonth()
  document.getElementById('week-label').innerHTML = sameMonth
    ? `<span class="week-prefix">Semaine </span><span>${mon.getDate()} au ${ven.getDate()} ${MONTHS_FULL[ven.getMonth()]} ${ven.getFullYear()}</span>`
    : `<span class="week-prefix">Semaine </span><span>${mon.getDate()} ${MONTHS_FULL[mon.getMonth()]} au ${ven.getDate()} ${MONTHS_FULL[ven.getMonth()]} ${ven.getFullYear()}</span>`

  document.getElementById('cdm-day-panel').innerHTML =
    `<div class="loading-message">Chargement…</div>`

  const dateKeys = days.map(d => localDateKey(d))
  lastRegsData   = await loadWeekRegs(dateKeys)
  lastDayInfoMap = await loadDayInfo(dateKeys)

  renderDaySelector()
  renderDayPanel()
}

// ── Sélecteur de jour ────────────────────────────────────────────────
// Les 5 jours de la semaine, toujours visibles côte à côte (mêmes variants
// visuels past/today/upcoming que sur planning-admin) — cliquables pour
// choisir le jour affiché dans le panneau ci-dessous.
function renderDaySelector() {
  let html = ''
  lastWeekDays.forEach((day, i) => {
    const diff        = dayDiff(day)
    const isPast      = diff < 0
    const isToday     = diff === 0
    const dayVariant  = isPast ? 'past' : isToday ? 'today' : 'upcoming'
    const dayFullName = DAYS_FULL[day.getDay()]
    const monthFull   = MONTHS_FULL[day.getMonth()]
    const selectedMod = i === activeDayIndex ? ' miaa-day--selected' : ''

    // .day-heading est un <span>, pas un <h2>, ici : le contenu d'un
    // <button> ne peut pas inclure d'élément de titre (contrairement à
    // <summary>, voir planning-admin.js) — l'aria-label du bouton porte déjà
    // le nom accessible complet, .day-heading ne sert qu'à la mise en page
    // (voir .miaa-day .day-heading, miaa-components.css, sélecteur non lié
    // au tag).
    // aria-current (pas aria-pressed) : un seul jour "courant" parmi un
    // ensemble mutuellement exclusif, pas un bouton bascule indépendant.
    const currentAttr = i === activeDayIndex ? ' aria-current="true"' : ''
    html += `<button type="button" class="miaa-day miaa-day--${dayVariant}${selectedMod}"
        onclick="selectDay(${i})"${currentAttr}
        aria-label="Afficher ${dayFullName} ${day.getDate()} ${monthFull}">
      <span class="day-heading">
        <span class="miaa-day__name" aria-hidden="true">${DAYS_FR[i]}</span>
        <span class="miaa-day__num">${day.getDate()}</span>
        <span class="miaa-day__month" aria-hidden="true">${MONTHS_FR[day.getMonth()]}</span>
      </span>
    </button>`
  })
  document.getElementById('cdm-days').innerHTML = html
}

// ── Panneau du jour actif ───────────────────────────────────────────
// Affiche CDM / repas / info du jour / cuisiniers / maraudeurs en lignes
// (empilées en colonne sous 901px de large, voir css/cdm.css).
function renderDayPanel() {
  const day  = lastWeekDays[activeDayIndex]
  const ds   = localDateKey(day)
  const isPast      = dayDiff(day) < 0
  const dayFullName = DAYS_FULL[day.getDay()]
  const monthFull   = MONTHS_FULL[day.getMonth()]
  const info = lastDayInfoMap[ds] || {}

  const cdmRole       = ROLES.find(r => r.isCdm)
  const cuisinierRole = ROLES.find(r => r.id === 'cuisinier')
  const maraudeurRole = ROLES.find(r => r.id === 'maraudeur')
  const regsFor = roleId => lastRegsData.filter(r => r.date === ds && r.role === roleId)

  let html = `<h2 class="cdm-panel-title">${dayFullName} ${day.getDate()} ${monthFull}${
    isPast ? ' <span class="cdm-panel-title__past">(jour passé)</span>' : ''}</h2>`

  html += `<div class="cdm-day-content${isPast ? ' cdm-day-content--past' : ''}">`

  // Ligne 1 : CDM + nombre de repas + menu, sur la même ligne
  html += `<div class="cdm-row cdm-row--cdm">`
  html += cdmSlotHTML(cdmRole, regsFor('cdm'))
  html += `<div class="cdm-field cdm-field--nombre">
    <label for="cdm-field-nombre-${ds}">Nombre de repas</label>
    <input type="number" inputmode="numeric" id="cdm-field-nombre-${ds}" value="${escAttr(info.nombre || '')}"
      onblur="saveDayInfoFieldFromInput(this,'${ds}','nombre')">
  </div>`
  html += `<div class="cdm-field cdm-field--menu">
    <label for="cdm-field-repas-${ds}">Menu</label>
    <textarea id="cdm-field-repas-${ds}" rows="1" oninput="autoResizeTextarea(this)"
      onblur="saveDayInfoFieldFromInput(this,'${ds}','repas')">${escHtml(info.repas || '')}</textarea>
  </div>`
  html += `</div>`

  // Ligne 2 : info du jour
  html += `<div class="cdm-row cdm-row--info">
    <div class="cdm-field cdm-field--infojour">
      <label for="cdm-field-infojour-${ds}">Info du jour</label>
      <textarea id="cdm-field-infojour-${ds}" rows="1" oninput="autoResizeTextarea(this)"
        onblur="saveDayInfoFieldFromInput(this,'${ds}','info_jour')">${escHtml(info.info_jour || '')}</textarea>
    </div>
  </div>`

  // Ligne 3 : cuisiniers · Ligne 4 : maraudeurs
  html += `<div class="cdm-row cdm-row--role">${roleRowHTML(cuisinierRole, regsFor('cuisinier'))}</div>`
  html += `<div class="cdm-row cdm-row--role">${roleRowHTML(maraudeurRole, regsFor('maraudeur'))}</div>`

  html += `</div>`

  document.getElementById('cdm-day-panel').innerHTML = html
  // Ajuste la hauteur des textarea au contenu déjà présent (pas seulement à la saisie)
  document.querySelectorAll('#cdm-day-panel textarea').forEach(autoResizeTextarea)

  // Annonce concise du changement de jour (voir #cdm-day-announce, cdm.html)
  // — le contenu, lui, ne re-décrit pas ce qui change au clavier/focus.
  document.getElementById('cdm-day-announce').textContent = `${dayFullName} ${day.getDate()} ${monthFull} affiché`
}

/** Bloc CDM (quota 1) — pas de texte "Aucune inscription" si vacant,
 * cohérent avec planning-admin.js. */
function cdmSlotHTML(role, regs) {
  let html = `<div class="cdm-role-block cdm-role-block--cdm">
    <div class="cdm-role-block__header">
      <h3 class="miaa-adminslot__role">${escHtml(role.label)}</h3>
    </div>`
  if (regs.length > 0) {
    html += `<div class="cdm-role-block__list">${regs.map(r => volunteerCardHTML(r, role)).join('')}</div>`
  }
  html += `</div>`
  return html
}

/** Bloc cuisiniers/maraudeurs : en-tête sur une seule ligne (rôle + horaire
 * d'un côté, carrés de places + comptage de l'autre) + cards bénévoles en
 * ligne (voir css/cdm.css). */
function roleRowHTML(role, regs) {
  const filled    = regs.length
  const remaining = role.quota - filled
  const isFull    = remaining <= 0
  const countMod  = isFull ? ' miaa-adminslot__count--full' : remaining <= 1 ? ' miaa-adminslot__count--warn' : ''
  const countTxt  = isFull ? 'Complet' : `${filled}/${role.quota}`

  let dotsHtml = ''
  for (let s = 0; s < role.quota; s++) {
    if (s < filled) {
      const dotMod = regs[s].status === 'pending' ? ' miaa-dot--pending' : ' miaa-dot--taken'
      dotsHtml += `<div class="miaa-dot${dotMod}"></div>`
    } else {
      dotsHtml += `<div class="miaa-dot"></div>`
    }
  }

  let html = `<div class="cdm-role-block">
    <div class="cdm-role-block__header">
      <div class="cdm-role-block__title-group">
        <h3 class="miaa-adminslot__role">${escHtml(role.label)}</h3>
        <span class="miaa-adminslot__time">${escHtml(role.time)}</span>
      </div>
      <div class="cdm-role-block__count-group">
        <div class="miaa-adminslot__dots" aria-hidden="true">${dotsHtml}</div>
        <span class="miaa-adminslot__count${countMod}">${countTxt}</span>
      </div>
    </div>`
  if (regs.length === 0) {
    html += `<div class="miaa-adminslot__empty">Aucune inscription</div>`
  } else {
    html += `<div class="cdm-role-block__list">${regs.map(r => volunteerCardHTML(r, role)).join('')}</div>`
  }
  html += `</div>`
  return html
}

function volunteerCardHTML(reg, role) {
  if (!reg.volunteers) return ''
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

  // Même composant/comportement que la card bénévole de planning-admin.js
  // (voir js/planning-admin.js) : toute la card ouvre la modale (ici en
  // lecture seule, openCdmView), un seul élément interactif au clavier — le
  // CTA "Voir" n'est qu'un repère visuel décoratif, pas un second bouton.
  return `<div class="miaa-volunteer${volMod}" role="button" tabindex="0"
    onclick="openCdmView('${reg.id}',event)"
    onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openCdmView('${reg.id}',event)}"
    aria-label="${identityLabel}">
    <span class="miaa-volunteer__identity">
      <span class="miaa-volunteer__avatar" aria-hidden="true">${initials(volNom || '?')}</span>
      <span class="miaa-volunteer__info">
        <span class="miaa-volunteer__name">${escHtml(volNom)}</span>
        <span class="miaa-volunteer__meta">${escHtml(reg.volunteers.tel)}</span>
        ${permisBadge}
        ${firstTimeBadge}
        ${noteDisplay}
      </span>
    </span>
    <span class="miaa-volunteer__actions">
      <span class="miaa-volunteer__status">${stTxt}</span>
      <span class="miaa-volunteer__view" aria-hidden="true">Voir</span>
    </span>
  </div>`
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
