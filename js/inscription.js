/**
 * inscription.js
 * Logique métier et interface de la page d'inscription bénévole.
 *
 * Dépendances (à charger avant ce fichier dans le HTML) :
 *   - @supabase/supabase-js v2 (CDN)
 *   - js/supabase-config.js  → db, SUPABASE_URL, SUPABASE_ANON
 *   - js/date-utils.js       → TODAY, DAYS_FR, MONTHS_FR, MONTHS_FULL, DAYS_FULL,
 *                               getMonday, addDays, dateKey, dayDiff, urgency,
 *                               getParisHour, getWeekDays
 */

// ── État de la page ───────────────────────────────────────────────

/** Décalage en semaines par rapport à la semaine courante (0 = cette semaine) */
let currentWeekOffset = 0

/** Informations sur l'inscription en cours (remplies à l'ouverture de la modale) */
let pendingDate     = null
let pendingRole     = null
let pendingIsDouble = false

/** Dernier élément qui avait le focus avant l'ouverture d'une modale (pour y revenir à la fermeture) */
let lastFocusedTrigger = null

// ── Supabase : lecture ────────────────────────────────────────────

/**
 * Enregistre une nouvelle inscription dans Supabase.
 * Crée le bénévole s'il n'existe pas encore (upsert par email).
 * Vérifie l'absence de doublon pour ce créneau/rôle.
 * Déclenche l'Edge Function notify-admin pour notifier l'équipe par email.
 *
 * @param {string} ds         - Date au format YYYY-MM-DD
 * @param {string} roleId     - 'cuisinier' | 'maraudeur'
 * @param {string} nom
 * @param {string} prenom
 * @param {string} email
 * @param {string} tel
 * @param {boolean} permis
 * @param {string} [secu]
 * @param {string} [profession]
 * @param {string} [adresse]
 * @param {string} [urgenceNom]
 * @param {string} [urgenceTel]
 * @throws {Error} Si le bénévole est déjà inscrit à ce créneau
 */
async function storeReg(ds, roleId, nom, prenom, email, tel, permis,
                        secu = '', profession = '', adresse = '', codepostal = '',
                        ville = '', urgenceContact = '') {
  // 1. Recherche ou création du bénévole
const { data: existing } = await db
    .from('volunteers')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  let volunteerId

  if (existing) {
    volunteerId = existing.id
  } else {
    const { data: newVol, error: volError } = await db
    .from('volunteers')
    .insert({ nom, prenom, email, tel, permis, secu, profession, adresse, codepostal, ville,
              urgence_contact: urgenceContact, rgpd: true })
    .select('id')
    .single()

    
    if (newVol) volunteerId = newVol.id
  }

  // 2. Vérification anti-doublon sur ce créneau
  const { count: existingReg } = await db
    .from('registrations')
    .select('*', { count: 'exact', head: true })
    .eq('volunteers_id', volunteerId)
    .eq('date', ds)
    .eq('role', roleId)

  if (existingReg && existingReg > 0) {
    throw new Error('Vous êtes déjà inscrit à ce créneau pour cette activité.')
  }

  // 3. Création de l'inscription avec un token unique (utilisé pour la validation admin)
  const token = crypto.randomUUID()

  const { data: reg, error: regError } = await db
    .from('registrations')
    .insert({
      volunteers_id: volunteerId,
      date:          ds,
      role:          roleId,
      status:        'pending',
      Confirm_token: token
    })
    .select('id')
    .single()

  // 4. Notification email aux admins (ignorée silencieusement en local à cause du CORS)
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notify-admin`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON}`
      },
      body: JSON.stringify({ registration_id: reg.id })
    })
  } catch (e) {
    // En local (localhost), le CORS bloque cet appel.
    // En production (miaa.fr), il fonctionnera normalement.
    console.log('notify-admin ignoré en local:', e.message)
  }
}

// ── Rendu du planning ─────────────────────────────────────────────

/**
 * Affiche le planning de la semaine courante.
 * Récupère toutes les inscriptions de la semaine en une seule requête Supabase,
 * puis construit le HTML de chaque colonne jour par jour.
 */
async function renderWeek() {
  const days = getWeekDays(currentWeekOffset)

  // Navigation semaine
  document.getElementById('btn-prev').disabled = currentWeekOffset === 0
  document.getElementById('btn-next').disabled = currentWeekOffset === 1

  // Label de la semaine
  const mon = days[0], fri = days[4]
  const sameMonth = mon.getMonth() === fri.getMonth()
  document.getElementById('week-label').innerHTML = sameMonth
    ? `<span class="week-prefix">Semaine </span><span>${mon.getDate()} au ${fri.getDate()} ${MONTHS_FULL[fri.getMonth()]} ${fri.getFullYear()}</span>`
    : `<span class="week-prefix">Semaine </span><span>${mon.getDate()} ${MONTHS_FULL[mon.getMonth()]} au ${fri.getDate()} ${MONTHS_FULL[fri.getMonth()]} ${fri.getFullYear()}</span>`

  // Indicateur de chargement
  document.getElementById('planning-grid').innerHTML =
    '<div class="loading-message">Chargement…</div>'

  // Requête Supabase unique pour toute la semaine
  const dateKeys = days.map(d => dateKey(d))
  const { data: allRegs } = await db
    .from('registrations')
    .select('id, date, role, status, Confirm_token, volunteers ( id, nom, email, tel, permis )')
    .in('date', dateKeys)

  // Fonctions de comptage locales (évitent des requêtes supplémentaires)
  function countFilled(ds, roleId) {
    return (allRegs || []).filter(r => r.date === ds && r.role === roleId).length
  }
  function countPermis(ds) {
    return (allRegs || []).filter(r => r.date === ds && r.role === 'maraudeur' && r.volunteers?.permis).length
  }

  // Construction du HTML
  let html = ''
  days.forEach((day, i) => {
    const ds          = dateKey(day)
    const urg         = urgency(day)
    const isPast      = urg === 'past'
    const isToday     = dayDiff(day) === 0
    const dayVariant  = isPast ? 'past' : isToday ? 'today' : 'upcoming'
    const dayFullName = DAYS_FULL[day.getDay()]
    const monthFull   = MONTHS_FULL[day.getMonth()]

    // Coupures horaires : dès 8h (Paris) pour cuisine, dès 11h pour maraude
    const parisHour       = isToday ? getParisHour() : null
    const cuisinierClosed = isPast || (isToday && parisHour >= 8)
    const maraudeurClosed = isPast || (isToday && parisHour >= 11)

    const filledCuis  = countFilled(ds, 'cuisinier')
    const filledMar   = countFilled(ds, 'maraudeur')
    const permisCount = countPermis(ds)

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

    html += buildSlot('cuisinier', 'Cuisiniers', '8h – 12h', ds, filledCuis, 5, urg, cuisinierClosed, false)
    html += buildSlotMaraude(ds, filledMar, 4, permisCount, urg, maraudeurClosed)

    if (!isPast) {
      const rCuis     = 5 - filledCuis
      const rMar      = 4 - filledMar
      const canDouble = !cuisinierClosed && !maraudeurClosed && rCuis > 0 && rMar > 0
      const dateLabel = `${dayFullName} ${day.getDate()} ${MONTHS_FULL[day.getMonth()]}`

      if (canDouble) {
        html += `<button
          class="miaa-double miaa-double--${urg}"
          onclick="openModal('${ds}','double','Cuisine &amp; Maraude','8h – 12h / 11h – après-midi',true)"
          aria-label="Je m'inscris en cuisine et maraude, ${dateLabel}"
        >S'inscrire en cuisine et maraude</button>`
      } else {
        html += `<button class="miaa-double" disabled
          aria-label="Cuisine et maraude indisponible, ${dateLabel}"
        >Cuisine &amp; maraude — indisponible</button>`
      }
    }

    html += `</div>`
  })

  document.getElementById('planning-grid').innerHTML = html
}

// ── Construction des cartes de créneaux ──────────────────────────

/**
 * Retourne la classe CSS de variante visuelle d'un créneau.
 * @param {boolean} isClosed - jour passé OU heure de coupure dépassée
 * @param {boolean} isFull
 * @param {string}  urg
 * @returns {string}
 */
function slotVariantClass(isClosed, isFull, urg) {
  if (isClosed) return 'miaa-slot--past'
  if (isFull)   return 'miaa-slot--full'
  return `miaa-slot--${urg}`
}

/**
 * Construit le badge "X places" ou "Complet" d'un créneau.
 * @param {boolean} isFull
 * @param {string}  urg
 * @param {number}  remaining
 * @returns {string} HTML du badge
 */
function buildBadge(isFull, urg, remaining) {
  if (isFull) {
    return `<span class="miaa-slot__badge miaa-slot__badge--full">
      <i class="fas fa-check" aria-hidden="true"></i> Complet
    </span>`
  }
  const icon = urg === 'urgent' ? '<i class="fas fa-bolt" aria-hidden="true"></i> '
             : urg === 'soon'   ? '<i class="fas fa-clock" aria-hidden="true"></i> '
             : ''
  const plural = remaining > 1
  return `<span class="miaa-slot__badge">${icon}${remaining} place${plural ? 's' : ''}</span>`
}

/**
 * Construit la rangée de cases "places prises / libres" d'un créneau.
 * @param {number} filled
 * @param {number} quota
 * @returns {string} HTML des cases
 */
function buildSpots(filled, quota) {
  let html = `<div class="miaa-spots" aria-hidden="true">`
  for (let s = 0; s < quota; s++) {
    html += `<div class="miaa-spots__sq${s < filled ? ' miaa-spots__sq--taken' : ''}"></div>`
  }
  return html + `</div>`
}

/**
 * Construit la carte HTML d'un créneau générique (Cuisiniers).
 */
function buildSlot(roleId, label, time, ds, filled, quota, urg, isClosed, isMaraude) {
  const remaining = quota - filled
  const isFull    = remaining === 0
  const varCls    = slotVariantClass(isClosed, isFull, urg)
  const d         = new Date(ds + 'T00:00:00')
  const dateLabel = `${DAYS_FULL[d.getDay()]} ${d.getDate()} ${MONTHS_FULL[d.getMonth()]}`

  let html = `<div class="miaa-slot ${varCls}">`
  html += `<div class="miaa-slot__header">
    <h3 class="miaa-slot__role">${label}</h3>
    <span class="miaa-slot__time">${time}</span>
  </div>`
  html += buildSpots(filled, quota)
  html += buildBadge(isFull, urg, remaining)

  if (!isClosed) {
    if (isFull) {
      html += `<button class="miaa-slot__cta miaa-slot__cta--full" disabled
        aria-label="${label}, ${dateLabel}, ${time} — créneau complet">Complet</button>`
    } else {
      const ariaLabel = `Je m'inscris comme ${label}, ${dateLabel}, ${time} (${remaining} place${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''})`
      html += `<button class="miaa-slot__cta"
        onclick="openModal('${ds}','${roleId}','${label}','${time}',${isMaraude})"
        aria-label="${ariaLabel}">Je m'inscris</button>`
    }
  }
  return html + `</div>`
}

/**
 * Construit la carte HTML du créneau Maraudeurs (variante avec info permis).
 */
function buildSlotMaraude(ds, filled, quota, permisCount, urg, isClosed) {
  const remaining = quota - filled
  const isFull    = remaining === 0
  const varCls    = slotVariantClass(isClosed, isFull, urg)
  const time      = "11h – début d'après-midi"
  const d         = new Date(ds + 'T00:00:00')
  const dateLabel = `${DAYS_FULL[d.getDay()]} ${d.getDate()} ${MONTHS_FULL[d.getMonth()]}`

  let html = `<div class="miaa-slot ${varCls}">`
  html += `<div class="miaa-slot__header">
    <h3 class="miaa-slot__role">Maraudeurs</h3>
    <span class="miaa-slot__time">${time}</span>
  </div>`
  html += buildSpots(filled, quota)
  html += buildBadge(isFull, urg, remaining)
  html += `<div class="miaa-slot__permis">
    <i class="fas fa-car" aria-hidden="true"></i>
    <span>Permis ${permisCount}/2</span>
  </div>`

  if (!isClosed) {
    if (isFull) {
      html += `<button class="miaa-slot__cta miaa-slot__cta--full" disabled
        aria-label="Maraudeurs, ${dateLabel}, ${time} — créneau complet">Complet</button>`
    } else {
      const ariaLabel = `Je m'inscris comme Maraudeur, ${dateLabel}, ${time} (${remaining} place${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''})`
      html += `<button class="miaa-slot__cta"
        onclick="openModal('${ds}','maraudeur','Maraudeurs','11h – début après-midi',true)"
        aria-label="${ariaLabel}">Je m'inscris</button>`
    }
  }
  return html + `</div>`
}

// ── Navigation de semaine ─────────────────────────────────────────

function changeWeek(dir) {
  currentWeekOffset = Math.max(0, Math.min(1, currentWeekOffset + dir))
  localStorage.setItem('miaa-week', currentWeekOffset)
  renderWeek()
}

// ── Modale principale d'inscription ──────────────────────────────

/**
 * Ouvre la modale d'inscription pour un créneau donné.
 * @param {string}  dateStr
 * @param {string}  roleId
 * @param {string}  roleLabel
 * @param {string}  roleTime
 * @param {boolean} isMaraude - affiche la question sur le permis si true
 */
function openModal(dateStr, roleId, roleLabel, roleTime, isMaraude) {
  pendingDate     = dateStr
  pendingRole     = roleId
  pendingIsDouble = roleId === 'double'
  lastFocusedTrigger = document.activeElement

  const d = new Date(dateStr + 'T00:00:00')
  const displayDate = `${DAYS_FULL[d.getDay()]} ${d.getDate()} ${MONTHS_FULL[d.getMonth()]}`

  document.getElementById('modal-title').textContent       = `S'inscrire — ${roleLabel}`
  document.getElementById('modal-tag-date').textContent    = displayDate
  document.getElementById('modal-tag-role').textContent    = roleLabel
  document.getElementById('modal-tag-time').textContent    = roleTime
  document.getElementById('permis-group').style.display    = isMaraude ? 'block' : 'none'

  ;['inp-nom', 'inp-prenom', 'inp-tel', 'inp-email'].forEach(id => {
    const el = document.getElementById(id)
    el.value = ''
    el.classList.remove('error')
    el.setAttribute('aria-invalid', 'false')
  })
  document.getElementById('inp-permis').checked = false
  ;['err-nom', 'err-tel', 'err-email'].forEach(id => {
    document.getElementById(id).style.display = 'none'
  })

  document.getElementById('modal-form-content').style.display   = 'block'
  document.getElementById('modal-success-content').style.display = 'none'
  document.getElementById('modal-overlay').classList.add('open')
  document.body.style.overflow = 'hidden'
  setTimeout(() => document.getElementById('inp-nom').focus(), 120)
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open')
  document.body.style.overflow = ''
  renderWeek()
  if (lastFocusedTrigger && typeof lastFocusedTrigger.focus === 'function') {
    setTimeout(() => { try { lastFocusedTrigger.focus() } catch {} }, 50)
  }
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal()
}

function validateEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

/**
 * Soumet le formulaire principal.
 * Si le bénévole existe déjà → inscription directe.
 * Si c'est un nouveau bénévole → ouvre la modale complémentaire (RGPD + infos).
 */
async function submitForm() {
  const nom    = document.getElementById('inp-nom').value.trim()
  const tel    = document.getElementById('inp-tel').value.trim()
  const email  = document.getElementById('inp-email').value.trim()
  const permis = document.getElementById('inp-permis').checked

  // Validation des champs
  let valid = true, firstInvalid = null
  const checks = [
    { ok: nom.length > 0,       errId: 'err-nom',   inputId: 'inp-nom'   },
    { ok: tel.length > 0,       errId: 'err-tel',   inputId: 'inp-tel'   },
    { ok: validateEmail(email), errId: 'err-email', inputId: 'inp-email' },
  ]
  checks.forEach(({ ok, errId, inputId }) => {
    const errEl = document.getElementById(errId)
    const inpEl = document.getElementById(inputId)
    errEl.style.display = ok ? 'none' : 'block'
    inpEl.classList[ok ? 'remove' : 'add']('error')
    inpEl.setAttribute('aria-invalid', ok ? 'false' : 'true')
    if (!ok) { valid = false; if (!firstInvalid) firstInvalid = inpEl }
  })
  if (!valid) { if (firstInvalid) firstInvalid.focus(); return }

  const btnConfirm = document.querySelector('#modal .btn-primary')
  btnConfirm.disabled    = true
  btnConfirm.textContent = 'Vérification…'

  // Vérifie si le bénévole est déjà connu
  const { data: existing } = await db
    .from('volunteers')
    .select('id')
    .eq('email', email)
    .maybeSingle()


  if (existing) {
    try {
      if (pendingIsDouble) {
        await storeReg(pendingDate, 'cuisinier', nom, email, tel, false)
        await storeReg(pendingDate, 'maraudeur', nom, email, tel, permis)
      } else {
        await storeReg(pendingDate, pendingRole, nom, email, tel, permis)
      }
      document.getElementById('modal-form-content').style.display   = 'none'
      document.getElementById('modal-success-content').style.display = 'block'
    } catch (err) {
      console.error(err)
      btnConfirm.disabled    = false
      btnConfirm.textContent = 'Confirmer mon inscription'
      alert(err.message.includes('déjà inscrit')
        ? 'Vous êtes déjà inscrit à ce créneau pour cette activité.'
        : 'Une erreur est survenue, merci de réessayer.')
    }
  } else {
    // Nouveau bénévole → modale complémentaire
    btnConfirm.disabled    = false
    btnConfirm.textContent = 'Confirmer mon inscription'
    openModalExtra()
  }
}

// ── Modale informations complémentaires (nouveau bénévole) ────────

function openModalExtra() {
  // 1. Copie les tags
  document.getElementById('modal-extra-tag-date').textContent = document.getElementById('modal-tag-date').textContent
  document.getElementById('modal-extra-tag-role').textContent = document.getElementById('modal-tag-role').textContent
  document.getElementById('modal-extra-tag-time').textContent = document.getElementById('modal-tag-time').textContent

  // 2. Vide les champs D'ABORD
  ;['inp-secu', 'inp-profession', 'inp-adresse', 'inp-codepostal', 'inp-ville', 'inp-urgence-nom', 'inp-urgence-tel'].forEach(id => {
    document.getElementById(id).value = ''
  })
  document.getElementById('inp-rgpd').checked           = false
  document.getElementById('err-secu').style.display     = 'none'
  document.getElementById('err-urgence').style.display  = 'none'
  document.getElementById('btn-confirm-extra').disabled = true

  // 3. Ajoute les écouteurs APRÈS avoir vidé
  const secu       = document.getElementById('inp-secu')
  const urgenceNom = document.getElementById('inp-urgence-nom')
  const urgenceTel = document.getElementById('inp-urgence-tel')

  secu.removeEventListener('input', checkExtraFormValid)
  urgenceNom.removeEventListener('input', checkExtraFormValid)
  urgenceTel.removeEventListener('input', checkExtraFormValid)

  secu.addEventListener('input', checkExtraFormValid)
  urgenceNom.addEventListener('input', checkExtraFormValid)
  urgenceTel.addEventListener('input', checkExtraFormValid)

  // 4. Ouvre la modale
  document.getElementById('modal-overlay').classList.remove('open')
  document.getElementById('modal-overlay-extra').classList.add('open')
}

function closeModalExtra() {
  document.getElementById('modal-overlay-extra').classList.remove('open')
  document.body.style.overflow = ''
}

function backToMainModal() {
  document.getElementById('modal-overlay-extra').classList.remove('open')
  document.getElementById('modal-overlay').classList.add('open')
}

function handleOverlayClickExtra(e) {
  if (e.target === document.getElementById('modal-overlay-extra')) closeModalExtra()
}

/** Active/désactive le bouton de confirmation selon la case RGPD */
function checkExtraFormValid() {
  const secu       = document.getElementById('inp-secu').value.trim()
  const urgenceNom = document.getElementById('inp-urgence-nom').value.trim()
  const urgenceTel = document.getElementById('inp-urgence-tel').value.trim()
  const rgpd       = document.getElementById('inp-rgpd').checked

  console.log('check:', { secu, urgenceNom, urgenceTel, rgpd })

  document.getElementById('btn-confirm-extra').disabled =
    !(secu && urgenceNom && urgenceTel && rgpd)
}

function handleRgpdChange() {
  checkExtraFormValid()
}

/**
 * Soumet la modale complémentaire (nouveau bénévole).
 * Valide les champs requis (sécu + personne à prévenir) puis enregistre.
 */
async function submitFormExtra() {
  const secu       = document.getElementById('inp-secu').value.trim()
  const urgenceNom = document.getElementById('inp-urgence-nom').value.trim()
  const urgenceTel = document.getElementById('inp-urgence-tel').value.trim()
  const urgenceContact = `${urgenceNom} / ${urgenceTel}`.trim()
  const profession = document.getElementById('inp-profession').value.trim()
  const adresse     = document.getElementById('inp-adresse').value.trim()
  const codepostal  = document.getElementById('inp-codepostal').value.trim()
  const ville       = document.getElementById('inp-ville').value.trim()
  const nom        = document.getElementById('inp-nom').value.trim()
  const prenom = document.getElementById('inp-prenom').value.trim()
  const tel        = document.getElementById('inp-tel').value.trim()
  const email      = document.getElementById('inp-email').value.trim()
  const permis     = document.getElementById('inp-permis').checked

  let valid = true
  if (!secu) {
    document.getElementById('err-secu').style.display = 'block'
    document.getElementById('inp-secu').setAttribute('aria-invalid', 'true')
    valid = false
  } else {
    document.getElementById('err-secu').style.display = 'none'
    document.getElementById('inp-secu').setAttribute('aria-invalid', 'false')
  }
  if (!urgenceNom || !urgenceTel) {
    document.getElementById('err-urgence').style.display = 'block'
    valid = false
  } else {
    document.getElementById('err-urgence').style.display = 'none'
  }
  if (!valid) return

  const btn = document.getElementById('btn-confirm-extra')
  btn.disabled    = true
  btn.textContent = 'Envoi en cours…'

  try {
    if (pendingIsDouble) {
      await storeReg(pendingDate, 'cuisinier', nom, prenom, email, tel, false, secu, profession, adresse, codepostal, ville, urgenceContact)
      await storeReg(pendingDate, 'maraudeur', nom, prenom, email, tel, permis, secu, profession, adresse, codepostal, ville, urgenceContact)
    } else {
      await storeReg(pendingDate, pendingRole, nom, prenom, email, tel, permis, secu, profession, adresse, codepostal, ville, urgenceContact)
    }

    closeModalExtra()
    document.getElementById('modal-form-content').style.display   = 'none'
    document.getElementById('modal-success-content').style.display = 'block'
    document.getElementById('modal-overlay').classList.add('open')

  } catch (err) {
    console.error(err)
    console.error('Erreur complète:', err)
    console.error('Message:', err.message)
    btn.disabled    = false
    btn.textContent = 'Confirmer mon inscription'
    alert(err.message.includes('déjà inscrit')
      ? 'Vous êtes déjà inscrit à ce créneau pour cette activité.'
      : 'Une erreur est survenue, merci de réessayer.')
  }
}

// ── Initialisation ────────────────────────────────────────────────

currentWeekOffset = parseInt(localStorage.getItem('miaa-week') || '0')
if (isNaN(currentWeekOffset) || currentWeekOffset < 0 || currentWeekOffset > 1) {
  currentWeekOffset = 0
}
renderWeek()

// Gestion clavier : Échap pour fermer, Tab pour cycler dans la modale (RGAA 12.13)
document.addEventListener('keydown', e => {
  const overlayMain  = document.getElementById('modal-overlay')
  const overlayExtra = document.getElementById('modal-overlay-extra')
  const mainOpen  = overlayMain.classList.contains('open')
  const extraOpen = overlayExtra.classList.contains('open')
  if (!mainOpen && !extraOpen) return

  if (e.key === 'Escape') {
    if (extraOpen) closeModalExtra()
    else closeModal()
    return
  }

  if (e.key === 'Tab') {
    const activeOverlay = extraOpen ? overlayExtra : document.getElementById('modal')
    const focusables = Array.from(activeOverlay.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => {
      if (el.closest('[style*="display:none"], [style*="display: none"]')) return false
      return el.offsetParent !== null || el === document.activeElement
    })
    if (!focusables.length) return
    const first = focusables[0], last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus()
    }
  }
})
