/**
 * admin-date-utils.js
 * Utilitaires de date partagés entre planning-admin.html et cdm.html — avant
 * extraction ici, ils étaient dupliqués à l'identique dans js/planning-admin.js
 * et js/cdm.js.
 *
 * Distinct de js/date-utils.js (utilisé par inscription.html) : ce dernier a
 * sa propre version de getWeekDays() qui reporte la semaine au lundi suivant
 * quand TODAY tombe un week-end (pertinent pour le formulaire public, qui ne
 * doit pas proposer une semaine déjà entamée) — un comportement qui casserait
 * la navigation par semaine de planning-admin/cdm (WEEK_OFFSET_MIN/MAX côté
 * admin, currentWeekOffset 0-4 côté CDM), toutes deux pensées comme un simple
 * décalage depuis la semaine courante réelle. D'où ce fichier séparé plutôt
 * qu'une réutilisation directe de date-utils.js.
 *
 * Expose en global :
 *   TODAY, DAYS_FR, MONTHS_FR, MONTHS_FULL, DAYS_FULL
 *   getMonday(d), addDays(d, n), localDateKey(d), dayDiff(d), getWeekDays(offset)
 */

// ── Constantes ────────────────────────────────────────────────────
const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })()
const DAYS_FR     = ['Lun','Mar','Mer','Jeu','Ven']
const MONTHS_FR   = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc']
const MONTHS_FULL = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
const DAYS_FULL   = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']

// ── Fonctions ─────────────────────────────────────────────────────
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

/** Les 5 jours ouvrés (lun→ven) de la semaine décalée de `offset` semaines
 * depuis la semaine courante (pas de report de week-end, voir plus haut). */
function getWeekDays(offset) {
  const monday = getMonday(addDays(TODAY, offset * 7))
  return Array.from({ length: 5 }, (_, i) => addDays(monday, i))
}
