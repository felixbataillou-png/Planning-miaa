/**
 * dom-utils.js
 * Petits utilitaires DOM/texte partagés entre planning-admin.html et cdm.html
 * (mêmes composants visuels .miaa-volunteer / .miaa-dropdown, voir
 * miaa-components.css) — avant extraction ici, ces fonctions étaient
 * dupliquées à l'identique dans js/planning-admin.js et js/cdm.js.
 *
 * Expose en global :
 *   escHtml(s), escAttr(s), initials(name), autoResizeTextarea(el)
 */

/** Échappe une chaîne pour l'injecter sans risque dans du HTML (innerHTML). */
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

/** Échappe une chaîne pour l'injecter sans risque dans un attribut HTML. */
function escAttr(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;')
}

/** Initiales (prénom + nom) affichées dans l'avatar d'une card bénévole. */
function initials(name) {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

/** Fait grandir/rétrécir un textarea pour s'ajuster à son contenu. */
function autoResizeTextarea(el) {
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}
