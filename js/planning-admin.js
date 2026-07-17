/**
 * planning-admin.js
 * Logique métier et interface de la page de gestion du planning (vue admin).
 *
 * Dépendances (à charger avant ce fichier dans le HTML) :
 *   - @supabase/supabase-js v2 (CDN)
 *   - js/supabase-config.js  → db, SUPABASE_URL, SUPABASE_ANON
 *   - js/date-utils.js       → TODAY, DAYS_FR, MONTHS_FR, MONTHS_FULL, DAYS_FULL,
 *                               getMonday, addDays, dateKey, dayDiff, getWeekDays
 *
 * Accès protégé : l'écran de connexion (OTP par email via Supabase Auth)
 * s'affiche automatiquement si aucune session n'est active.
 */

// ── Configuration métier ──────────────────────────────────────────

/**
 * Définition des rôles disponibles dans le planning.
 * Quota : nombre de places par créneau.
 * isMaraude : affiche le champ "permis" dans les formulaires si true.
 */
const ROLES = [
  { id: 'cuisinier', label: 'Cuisiniers', quota: 5, time: '8h – 12h',             isMaraude: false },
  { id: 'maraudeur', label: 'Maraudeurs', quota: 4, time: '11h – début après-midi', isMaraude: true  },
]

// ── État ──────────────────────────────────────────────────────────

/** Décalage en semaines (0 = semaine courante, max 4 = dans 4 semaines) */
let currentWeekOffset = parseInt(localStorage.getItem('miaa-admin-week') || '0')
if (isNaN(currentWeekOffset) || currentWeekOffset < 0 || currentWeekOffset > 4) {
  currentWeekOffset = 0
}

/** Action modale en cours (édition ou suppression) */
let pendingAction = null

/** Cible d'un ajout admin (date + rôle) */
let addTarget = null

/** Données temporaires lors d'un ajout de nouveau bénévole (modale extra) */
let addExtraData = null

/** Si true, le créneau d'ajout est de type maraude (affiche champ permis) */
let addIsMaraude = false

/** Statut original avant modification (pour détecter un vrai changement) */
let editOriginalStatus = null

/** Dernier élément avec le focus avant ouverture d'une modale (RGAA 12.13) */
let lastFocusedTrigger = null

// ── Authentification ──────────────────────────────────────────────

/** Email saisi lors de la demande de code */
let loginEmail = ''

/**
 * Vérifie s'il existe une session active.
 * Affiche ou masque l'écran de connexion en conséquence.
 */
async function checkAuth() {
  const { data: { session } } = await db.auth.getSession()
  document.getElementById('login-screen').style.display = session ? 'none' : 'flex'
  if (session) renderPage()
}

/**
 * Envoie un code OTP à l'adresse email saisie.
 * Supabase refusera automatiquement les adresses non autorisées
 * (signup désactivé dans Authentication → Settings).
 */
async function sendLoginCode() {
  loginEmail = document.getElementById('login-email').value.trim()
  const errEl = document.getElementById('login-error')

  const { error } = await db.auth.signInWithOtp({ email: loginEmail })

  console.log('erreur OTP:', error)

  if (error) {
    errEl.textContent    = "Cette adresse n'est pas autorisée."
    errEl.style.display  = 'block'
    return
  }

  document.getElementById('login-step-email').style.display = 'none'
  document.getElementById('login-step-code').style.display  = 'block'
}

/**
 * Vérifie le code OTP saisi et ouvre la session si correct.
 */
async function verifyLoginCode() {
  const code  = document.getElementById('login-code').value.trim()
  const errEl = document.getElementById('login-error-code')

  const { error } = await db.auth.verifyOtp({
    email: loginEmail,
    token: code,
    type:  'email'
  })

  if (error) {
    errEl.textContent   = 'Code invalide ou expiré.'
    errEl.style.display = 'block'
    return
  }

  document.getElementById('login-screen').style.display = 'none'
  renderPage()
}

/** Déconnecte l'admin et retourne à l'écran de connexion. */
async function logout() {
  await db.auth.signOut()
  document.getElementById('login-screen').style.display     = 'flex'
  document.getElementById('login-step-email').style.display = 'block'
  document.getElementById('login-step-code').style.display  = 'none'
  document.getElementById('login-email').value = ''
  document.getElementById('login-code').value  = ''
}

// ── Supabase : lecture / écriture ─────────────────────────────────

/**
 * Récupère toutes les inscriptions d'un créneau donné, avec les infos bénévoles.
 * @param {string} ds     - Date YYYY-MM-DD
 * @param {string} roleId - 'cuisinier' | 'maraudeur'
 * @returns {Promise<Array>}
 */
async function getSlotRegs(ds, roleId) {
  const { data } = await db
    .from('registrations')
    .select('id, status, Confirm_token, volunteers ( id, nom, email, tel, permis )')
    .eq('date', ds)
    .eq('role', roleId)
  return data || []
}

/**
 * Met à jour le statut d'une inscription.
 * @param {string} regId
 * @param {string} newStatus - 'confirmed' | 'pending'
 */
async function setSlotStatus(regId, newStatus) {
  await db
    .from('registrations')
    .update({ status: newStatus })
    .eq('id', regId)
}

/**
 * Supprime définitivement une inscription.
 * @param {string} regId
 */
async function deleteReg(regId) {
  await db
    .from('registrations')
    .delete()
    .eq('id', regId)
}

/**
 * Ajoute manuellement un bénévole à un créneau (depuis la vue admin).
 * Crée le bénévole dans volunteers s'il n'existe pas encore.
 *
 * @param {string}  ds         - Date YYYY-MM-DD
 * @param {string}  roleId
 * @param {string}  nom
 * @param {string}  email
 * @param {string}  tel
 * @param {boolean} permis
 * @param {string}  status     - 'confirmed' | 'pending'
 * @param {string}  [secu]
 * @param {string}  [profession]
 * @param {string}  [adresse]
 * @param {string}  [urgenceNom]
 * @param {string}  [urgenceTel]
 */
async function addReg(ds, roleId, nom, email, tel, permis, status,
                      secu = '', profession = '', adresse = '',
                      urgenceNom = '', urgenceTel = '') {
  const { data: existing } = await db
    .from('volunteers')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  let volunteerId
  if (existing) {
    volunteerId = existing.id
  } else {
    const { data: newVol } = await db
      .from('volunteers')
      .insert({ nom, email, tel, permis, secu, profession, adresse,
                urgence_nom: urgenceNom, urgence_tel: urgenceTel, rgpd: true })
      .select('id')
      .single()
    volunteerId = newVol.id
  }

  const token = crypto.randomUUID()

  await db
    .from('registrations')
    .insert({
      volunteers_id: volunteerId,
      date:          ds,
      role:          roleId,
      status:        status,
      Confirm_token: token
    })
}

// ── Utilitaires HTML ──────────────────────────────────────────────

/** Échappe les caractères HTML spéciaux (anti-XSS dans le HTML généré). */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Échappe les guillemets pour les valeurs d'attributs HTML. */
function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/** Génère les initiales d'un nom complet (prénom + nom). */
function initials(name) {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// ── Navigation de semaine ─────────────────────────────────────────

async function changeWeek(dir) {
  currentWeekOffset = Math.max(0, Math.min(4, currentWeekOffset + dir))
  localStorage.setItem('miaa-admin-week', currentWeekOffset)
  await renderPage()
}

// ── Rendu du planning ─────────────────────────────────────────────

/**
 * Affiche le planning admin complet (stats + grille).
 * Récupère toutes les inscriptions de la semaine en une seule requête.
 */
async function renderPage() {
  const days = getWeekDays(currentWeekOffset)

  // Boutons de navigation
  document.getElementById('btn-prev').disabled = currentWeekOffset === 0
  document.getElementById('btn-next').disabled = currentWeekOffset === 4

  // Label semaine
  const mon = days[0], ven = days[4]
  const sameMonth = mon.getMonth() === ven.getMonth()
  document.getElementById('week-label').innerHTML = sameMonth
    ? `<span class="week-prefix">Semaine </span><span>${mon.getDate()} au ${ven.getDate()} ${MONTHS_FULL[ven.getMonth()]} ${ven.getFullYear()}</span>`
    : `<span class="week-prefix">Semaine </span><span>${mon.getDate()} ${MONTHS_FULL[mon.getMonth()]} au ${ven.getDate()} ${MONTHS_FULL[ven.getMonth()]} ${ven.getFullYear()}</span>`

  // Indicateur de chargement
  document.getElementById('planning-grid').innerHTML =
    '<div class="loading-message">Chargement…</div>'

  // Requête Supabase unique
  const dateKeys = days.map(d => dateKey(d))
  const { data: allRegs } = await db
    .from('registrations')
    .select('id, date, role, status, Confirm_token, volunteers ( id, nom, email, tel, permis )')
    .in('date', dateKeys)

  const regsData = allRegs || []

  // Calcul des statistiques de la semaine
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

  // Construction de la grille
  let html = ''
  days.forEach((day, i) => {
    const ds          = dateKey(day)
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
      const countMod  = isFull ? ' miaa-adminslot__count--full'
                      : remaining <= 1 ? ' miaa-adminslot__count--warn' : ''
      const countTxt  = isFull ? 'Complet' : `${filled}/${role.quota}`

      html += `<div class="miaa-adminslot${isPast ? ' miaa-adminslot--past' : ''}">`
      html += `<div class="miaa-adminslot__header">
        <div class="miaa-adminslot__info">
          <h3 class="miaa-adminslot__role">${escHtml(role.label)}</h3>
          <span class="miaa-adminslot__time">${escHtml(role.time)}</span>
        </div>
        <span class="miaa-adminslot__count${countMod}">${countTxt}</span>
      </div>`

      // Points colorés (bleu = confirmé, orange = en attente)
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

      // Liste des inscrits
      html += `<div class="miaa-adminslot__list">`
      if (regs.length === 0) {
        html += `<div class="miaa-adminslot__empty">Aucune inscription</div>`
      } else {
        regs.forEach(reg => {
          const isPending     = reg.status === 'pending'
          const volMod        = isPending ? ' miaa-volunteer--pending' : ' miaa-volunteer--confirmed'
          const stTxt         = isPending ? 'En attente' : 'Confirmé'
          const permisBadge   = role.isMaraude && reg.volunteers.permis
            ? `<span class="miaa-volunteer__permis"><i class="fas fa-car" aria-hidden="true"></i>Permis</span>`
            : ''
          const identityLabel = escAttr(`Modifier l'inscription de ${reg.volunteers.nom}, ${role.label.toLowerCase()}, ${dateLabel}, statut ${stTxt.toLowerCase()}`)
          const deleteLabel   = escAttr(`Supprimer l'inscription de ${reg.volunteers.nom}, ${role.label.toLowerCase()}, ${dateLabel}`)

          html += `<div class="miaa-volunteer${volMod}">
            <button type="button" class="miaa-volunteer__identity-btn"
              onclick="openEdit('${ds}','${role.id}','${reg.id}',event)"
              aria-label="${identityLabel}">
              <span class="miaa-volunteer__avatar" aria-hidden="true">${initials(reg.volunteers.nom)}</span>
              <span class="miaa-volunteer__info">
                <span class="miaa-volunteer__name">${escHtml(reg.volunteers.nom)}</span>
                <span class="miaa-volunteer__meta">${escHtml(reg.volunteers.tel)}</span>
                ${permisBadge}
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

      // Bouton d'ajout
      if (!isPast) {
        const addLabel = escAttr(`Ajouter une personne au créneau ${role.label.toLowerCase()}, ${dateLabel}, ${role.time}`)
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

// ── Gestionnaire d'ajout (évite les problèmes d'apostrophe dans onclick) ──

/**
 * Lit les données du bouton "Ajouter" via data-attributes
 * (plus sûr que de les passer directement en paramètres onclick).
 */
function handleAdd(btn) {
  const { date: ds, role: roleId, label: roleLabel, time: roleTime, maraude } = btn.dataset
  openAdd(ds, roleId, roleLabel, roleTime, maraude === 'true')
}

// ── Modales : helpers communs ─────────────────────────────────────

function handleOverlayClick(e, id) {
  if (e.target === document.getElementById(id)) closeModal(id)
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open')
  document.body.style.overflow = ''
  if (lastFocusedTrigger && typeof lastFocusedTrigger.focus === 'function') {
    setTimeout(() => { try { lastFocusedTrigger.focus() } catch (e) {} }, 50)
  }
}

function openModalEl(id) {
  lastFocusedTrigger = document.activeElement
  document.getElementById(id).classList.add('open')
  document.body.style.overflow = 'hidden'
}

/** Retourne les éléments focusables visibles d'un nœud DOM (pour le cycle Tab en modale). */
function getFocusable(node) {
  return Array.from(node.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(el => {
    if (el.closest('[style*="display:none"], [style*="display: none"]')) return false
    return el.offsetParent !== null || el === document.activeElement
  })
}

// ── Modale : Modifier une inscription ────────────────────────────

async function openEdit(dateStr, roleId, regId, event) {
  if (event) event.stopPropagation()
  const regs = await getSlotRegs(dateStr, roleId)
  const reg  = regs.find(r => String(r.id) === String(regId))
  if (!reg) return

  pendingAction      = { type: 'edit', dateStr, roleId, regId }
  editOriginalStatus = reg.status

  const role = ROLES.find(r => r.id === roleId)
  document.getElementById('edit-modal-sub').textContent         = `${role.label} · ${role.time}`
  document.getElementById('edit-nom').value                     = reg.volunteers.nom
  document.getElementById('edit-tel').value                     = reg.volunteers.tel
  document.getElementById('edit-email').value                   = reg.volunteers.email
  document.getElementById('edit-status').value                  = reg.status
  document.getElementById('edit-permis-display').style.display  = role.isMaraude && reg.volunteers.permis ? 'block' : 'none'

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
  showToast('green', editOriginalStatus === 'pending'
    ? `${reg.volunteers.nom} confirmé(e).`
    : 'Informations mises à jour.')
}

function deleteFromEdit() {
  document.getElementById('edit-status').removeEventListener('change', checkEditChanges)
  closeModal('modal-edit')
  const { dateStr, roleId, regId } = pendingAction
  openDelete(dateStr, roleId, regId)
}

// ── Modale : Ajouter une personne ────────────────────────────────

function openAdd(dateStr, roleId, roleLabel, roleTime, isMaraude) {
  addTarget    = { dateStr, roleId }
  addIsMaraude = isMaraude

  document.getElementById('add-modal-sub').textContent          = `${roleLabel} · ${roleTime}`
  document.getElementById('add-permis-group').style.display     = isMaraude ? 'block' : 'none'
  ;['add-nom', 'add-tel', 'add-email'].forEach(id => {
    const el = document.getElementById(id)
    el.value = ''; el.classList.remove('error'); el.setAttribute('aria-invalid', 'false')
  })
  document.getElementById('add-permis').checked = false
  document.getElementById('add-status').value   = 'confirmed'
  ;['add-err-nom', 'add-err-tel', 'add-err-email'].forEach(id => {
    document.getElementById(id).style.display = 'none'
  })

  openModalEl('modal-add')
  setTimeout(() => document.getElementById('add-nom').focus(), 120)
}

async function submitAdd() {
  const nom    = document.getElementById('add-nom').value.trim()
  const tel    = document.getElementById('add-tel').value.trim()
  const email  = document.getElementById('add-email').value.trim()
  const status = document.getElementById('add-status').value
  const permis = document.getElementById('add-permis').checked

  let valid = true, firstInvalid = null
  const checks = [
    { ok: nom.length > 0,                            errId: 'add-err-nom',   inputId: 'add-nom'   },
    { ok: tel.length > 0,                            errId: 'add-err-tel',   inputId: 'add-tel'   },
    { ok: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), errId: 'add-err-email', inputId: 'add-email' },
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

  // Vérifie si le bénévole est déjà connu
  const { data: existing } = await db
    .from('volunteers')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (existing) {
    try {
      await addReg(addTarget.dateStr, addTarget.roleId, nom, email, tel, permis, status)
      closeModal('modal-add')
      await renderPage()
      showToast('green', `${nom} ajouté(e) au créneau.`)
    } catch (err) {
      console.error(err)
      showToast('red', 'Une erreur est survenue, merci de réessayer.')
    }
  } else {
    // Nouveau bénévole → modale complémentaire
    closeModal('modal-add')
    openAddExtra(nom, email, tel, permis, status)
  }
}

// ── Modale : Informations complémentaires (ajout admin) ──────────

function openAddExtra(nom, email, tel, permis, status) {
  addExtraData = { nom, email, tel, permis, status }

  document.getElementById('add-extra-tag-date').textContent = document.getElementById('add-modal-sub').textContent

  ;['add-extra-secu', 'add-extra-profession', 'add-extra-adresse',
    'add-extra-urgence-nom', 'add-extra-urgence-tel'].forEach(id => {
    document.getElementById(id).value = ''
  })
  document.getElementById('add-extra-rgpd').checked              = false
  document.getElementById('add-extra-err-secu').style.display    = 'none'
  document.getElementById('add-extra-err-urgence').style.display = 'none'
  document.getElementById('btn-confirm-add-extra').disabled      = true

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

function handleOverlayClickAddExtra(e) {
  if (e.target === document.getElementById('modal-add-extra')) closeAddExtra()
}

function handleRgpdChangeAddExtra() {
  document.getElementById('btn-confirm-add-extra').disabled =
    !document.getElementById('add-extra-rgpd').checked
}

async function submitAddExtra() {
  const secu       = document.getElementById('add-extra-secu').value.trim()
  const urgenceNom = document.getElementById('add-extra-urgence-nom').value.trim()
  const urgenceTel = document.getElementById('add-extra-urgence-tel').value.trim()
  const profession = document.getElementById('add-extra-profession').value.trim()
  const adresse    = document.getElementById('add-extra-adresse').value.trim()

  let valid = true
  if (!secu) {
    document.getElementById('add-extra-err-secu').style.display = 'block'
    valid = false
  } else {
    document.getElementById('add-extra-err-secu').style.display = 'none'
  }
  if (!urgenceNom || !urgenceTel) {
    document.getElementById('add-extra-err-urgence').style.display = 'block'
    valid = false
  } else {
    document.getElementById('add-extra-err-urgence').style.display = 'none'
  }
  if (!valid) return

  const btn = document.getElementById('btn-confirm-add-extra')
  btn.disabled    = true
  btn.textContent = 'Ajout en cours…'

  try {
    await addReg(
      addTarget.dateStr, addTarget.roleId,
      addExtraData.nom, addExtraData.email, addExtraData.tel, addExtraData.permis, addExtraData.status,
      secu, profession, adresse, urgenceNom, urgenceTel
    )
    closeAddExtra()
    await renderPage()
    showToast('green', `${addExtraData.nom} ajouté(e) au créneau.`)
  } catch (err) {
    console.error(err)
    btn.disabled    = false
    btn.textContent = 'Confirmer'
    showToast('red', 'Une erreur est survenue, merci de réessayer.')
  }
}

// ── Modale : Supprimer une inscription ───────────────────────────

async function openDelete(dateStr, roleId, regId, event) {
  if (event) event.stopPropagation()
  const regs = await getSlotRegs(dateStr, roleId)
  const reg  = regs.find(r => String(r.id) === String(regId))
  if (!reg) return

  pendingAction = { type: 'delete', dateStr, roleId, regId }

  const role = ROLES.find(r => r.id === roleId)
  document.getElementById('del-modal-sub').textContent    = `${role.label} · ${role.time}`
  document.getElementById('del-person-info').innerHTML    = personInfoHTML(reg, role.isMaraude)
  document.getElementById('del-warning-text').textContent = reg.status === 'pending'
    ? "Cette personne sera supprimée et notifiée que sa demande n'a pas été retenue."
    : "Cette action est irréversible. La personne sera notifiée par email de l'annulation."

  openModalEl('modal-delete')
}

async function confirmDelete() {
  const { dateStr, roleId, regId } = pendingAction

  // Récupère les infos avant suppression (seront inaccessibles après)
  const regs = await getSlotRegs(dateStr, roleId)
  const reg  = regs.find(r => String(r.id) === String(regId))

  await deleteReg(regId)
  closeModal('modal-delete')
  await renderPage()
  showToast('red', 'Inscription supprimée.')

  // Ouvre un brouillon email pour prévenir le bénévole
  if (reg) {
    const role    = ROLES.find(r => r.id === roleId)
    const d       = new Date(dateStr + 'T00:00:00')
    const dateFr  = d.toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    })
    const wasPending = reg.status === 'pending'
    const subject    = wasPending
      ? `MIAA — À propos de ta demande d'inscription`
      : `MIAA — Annulation de ton créneau`
    const body = wasPending
      ? `Bonjour ${reg.volunteers.nom},\n\n`
      : `Bonjour ${reg.volunteers.nom},\n\nTon créneau du ${dateFr} (${role.label}) a été annulé.\n\n`

    window.open(`mailto:${reg.volunteers.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank')
  }
}

/**
 * Construit le HTML d'un encart d'informations bénévole (utilisé dans la modale de suppression).
 */
function personInfoHTML(reg, isMaraude) {
  const statusMod = reg.status === 'confirmed' ? 'status-dot--confirmed' : 'status-dot--pending'
  return `
    <div class="pib-row"><i class="fas fa-user" aria-hidden="true"></i><strong>${escHtml(reg.volunteers.nom)}</strong></div>
    <div class="pib-row"><i class="fas fa-phone" aria-hidden="true"></i>${escHtml(reg.volunteers.tel)}</div>
    <div class="pib-row"><i class="fas fa-envelope" aria-hidden="true"></i>${escHtml(reg.volunteers.email)}</div>
    ${isMaraude && reg.volunteers.permis ? '<div class="pib-row"><i class="fas fa-car" aria-hidden="true"></i>Possède le permis</div>' : ''}
    <div class="pib-row"><i class="fas fa-circle status-dot ${statusMod}" aria-hidden="true"></i>${reg.status === 'confirmed' ? 'Confirmé' : 'En attente de validation'}</div>
  `
}

// ── Toast de notification ─────────────────────────────────────────

let toastTimer = null

/**
 * Affiche une notification temporaire en bas à droite.
 * @param {'green' | 'red'} type
 * @param {string} msg
 */
function showToast(type, msg) {
  const el    = document.getElementById('toast')
  const msgEl = document.getElementById('toast-msg')
  msgEl.textContent = ''
  el.className = `toast toast-${type}`
  requestAnimationFrame(() => { msgEl.textContent = msg; el.classList.add('show') })
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.classList.remove('show') }, 3000)
}

// ── Initialisation ────────────────────────────────────────────────

// Gestion clavier dans les modales (Échap + cycle Tab — RGAA 12.13)
document.addEventListener('keydown', e => {
  const openId = ['modal-add', 'modal-delete', 'modal-edit', 'modal-add-extra'].find(id =>
    document.getElementById(id)?.classList.contains('open')
  )
  if (!openId) return

  if (e.key === 'Escape') { closeModal(openId); return }

  if (e.key === 'Tab') {
    const modal      = document.getElementById(openId).querySelector('.modal')
    const focusables = getFocusable(modal)
    if (focusables.length === 0) return
    const first = focusables[0], last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus()
    }
  }
})

// Point d'entrée : vérification de la session avant tout affichage
checkAuth()
