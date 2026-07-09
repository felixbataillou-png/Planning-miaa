/**
 * date-utils.js
 * Fonctions utilitaires de date utilisées par inscription.html et planning-admin.html.
 * Toutes les dates sont calculées en heure locale de l'appareil, sauf getParisHour()
 * qui force le fuseau Europe/Paris pour les coupures horaires.
 *
 * Expose en global :
 *   TODAY, DAYS_FR, MONTHS_FR, MONTHS_FULL, DAYS_FULL
 *   getMonday(d), addDays(d, n), dateKey(d), dayDiff(d),
 *   urgency(d), getParisHour(), getWeekDays(offset)
 */

// ── Constantes ────────────────────────────────────────────────────

/** Date du jour à minuit (heure locale) */
const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })()

const DAYS_FR     = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven']
const MONTHS_FR   = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc']
const MONTHS_FULL = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
                     'septembre', 'octobre', 'novembre', 'décembre']
const DAYS_FULL   = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

// ── Fonctions ─────────────────────────────────────────────────────

/**
 * Retourne le lundi de la semaine contenant la date donnée.
 * @param {Date} d
 * @returns {Date}
 */
function getMonday(d) {
  const date = new Date(d), dow = date.getDay() || 7
  date.setDate(date.getDate() - dow + 1)
  return date
}

/**
 * Ajoute n jours à une date sans modifier l'original.
 * @param {Date} d
 * @param {number} n
 * @returns {Date}
 */
function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/**
 * Formate une date en clé YYYY-MM-DD (format attendu par Supabase).
 * Utilise les méthodes locales pour éviter les décalages UTC.
 * @param {Date} d
 * @returns {string}
 */
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Différence en jours entre une date et aujourd'hui (TODAY).
 * Résultat négatif = passé, 0 = aujourd'hui, positif = futur.
 * @param {Date} d
 * @returns {number}
 */
function dayDiff(d) {
  const a = new Date(dateKey(d)), b = new Date(dateKey(TODAY))
  return Math.round((a - b) / 86400000)
}

/**
 * Catégorie d'urgence d'une date pour le code couleur des créneaux.
 * @param {Date} d
 * @returns {'past' | 'urgent' | 'soon' | 'normal'}
 */
function urgency(d) {
  const diff = dayDiff(d)
  if (diff < 0)  return 'past'
  if (diff <= 1) return 'urgent'
  if (diff <= 3) return 'soon'
  return 'normal'
}

/**
 * Retourne l'heure actuelle à Paris (0-23), indépendamment du fuseau
 * horaire de l'appareil du visiteur.
 * Utilisé pour désactiver les CTA d'inscription après l'heure de coupure.
 * @returns {number}
 */
function getParisHour() {
  return parseInt(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      hourCycle: 'h23'
    }).format(new Date()),
    10
  )
}

/**
 * Retourne les 5 jours ouvrés (lun→ven) de la semaine demandée.
 * @param {number} offset - décalage en semaines depuis la semaine courante
 * @returns {Date[]}
 */
function getWeekDays(offset) {
  const mon = getMonday(addDays(TODAY, offset * 7))
  return Array.from({ length: 5 }, (_, i) => addDays(mon, i))
}
