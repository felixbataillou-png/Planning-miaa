/**
 * cdm-site.js
 * Écran de connexion + header pour l'espace CDM (cdm.html).
 *
 * Séparé de admin-site.js volontairement : compte différent (email +
 * mot de passe distincts, table cdm_users plutôt que admins), droits
 * différents (accès en lecture restreint via vues volunteers_basic /
 * registrations_for_planning, écriture uniquement via la fonction RPC
 * update_registration_extra). Ne touche à aucun fichier de l'espace
 * admin existant.
 *
 * Usage : charger ce fichier AVANT js/cdm.js. La page appelante doit
 * définir window.onCdmReady = async function() { ... }.
 *
 * Dépendances :
 *   - @supabase/supabase-js v2 (CDN)
 *   - js/supabase-config.js → db
 */

;(function () {

  // ── Header CDM (pas de navigation inter-pages : un seul espace) ────
  function buildCdmHeader () {
    return `
      <div class="topbar">
        <div class="topbar-admin-badge">
          <i class="fas fa-utensils" aria-hidden="true"></i> Espace CDM
        </div>
        <div>
          <a href="https://www.facebook.com/pages/Association-MIAA/377808022330859"
            target="_blank" rel="noopener"
            aria-label="Page Facebook MIAA (nouvel onglet)">
            <i class="fab fa-facebook-f" aria-hidden="true"></i>
          </a>
          <a href="https://www.instagram.com/associationmiaa"
             target="_blank" rel="noopener"
             aria-label="Page Instagram de l'association MIAA (nouvel onglet)">
            <i class="fab fa-instagram" aria-hidden="true"></i>
          </a>
        </div>
      </div>

      <header class="site-header">
        <a href="cdm.html" aria-label="Espace CDM MIAA">
          <img class="logo" src="assets/logo.png" alt="MIAA">
        </a>
        <div class="header-right">
          <button onclick="CdmSite.logout()" class="btn-secondary"
              style="font-size:12px;padding:6px 14px"
              aria-label="Se déconnecter de l'espace CDM">
            <i class="fas fa-sign-out-alt" aria-hidden="true"></i> Déconnexion
          </button>
        </div>
      </header>`
  }

  // ── Écran de connexion ────────────────────────────────────────────
  function buildLoginScreen () {
    return `
      <div id="login-screen" class="login-screen">
        <div class="login-card">
          <h2 class="login-title">MIAA — Espace CDM</h2>
          <p class="login-subtitle">Connexion sécurisée</p>
          <div id="login-step-email">
            <div class="form-group">
              <label for="login-email">Adresse email</label>
              <input type="email" id="login-email" placeholder="cdm@miaa.fr">
            </div>
            <div class="form-group">
              <label for="login-password">Mot de passe</label>
              <input type="password" id="login-password" placeholder="••••••••">
            </div>
            <button class="btn-primary btn-full" onclick="CdmSite.login()">
              Se connecter
            </button>
            <p id="login-error" class="login-error"></p>
          </div>
        </div>
      </div>`
  }

  // ── Injection du header ───────────────────────────────────────────
  function inject () {
    const loginEl = document.getElementById('login-screen')
    if (!loginEl) {
      const wrapper = document.createElement('div')
      wrapper.innerHTML = buildLoginScreen()
      document.body.insertBefore(wrapper.firstElementChild, document.body.firstChild)
    }

    const headerEl = document.querySelector('cdm-header')
    if (headerEl) {
      const wrapper = document.createElement('div')
      wrapper.innerHTML = buildCdmHeader()
      headerEl.replaceWith(...wrapper.childNodes)
    }

    watchStickyHeaderHeight()
  }

  /** Expose la hauteur réelle du bandeau fixe (topbar + header, tous deux en
   * position:sticky) dans --sticky-header-height, pour que le sélecteur de
   * jour (.cdm-days) puisse se coller juste en dessous plutôt que sous une
   * valeur codée en dur — la hauteur du header est en mode "hug" (dépend du
   * logo), pas fixe. ResizeObserver plutôt qu'un seul calcul : réagit aussi
   * au chargement asynchrone du logo ou à un changement de breakpoint.
   * Identique à admin-site.js (dupliqué volontairement, voir en-tête de
   * fichier — les deux espaces restent indépendants). */
  function watchStickyHeaderHeight () {
    const header = document.querySelector('.site-header')
    if (!header || !window.ResizeObserver) return
    const update = () => {
      const h = header.getBoundingClientRect().bottom
      document.documentElement.style.setProperty('--sticky-header-height', h + 'px')
    }
    new ResizeObserver(update).observe(header)
    update()
  }

  async function grantAccessOrReject () {
    const { data: allowed, error } = await db.rpc('can_access_cdm')
    const errEl = document.getElementById('login-error')

    if (error || !allowed) {
      await db.auth.signOut()
      const loginScreen = document.getElementById('login-screen')
      if (loginScreen) loginScreen.style.display = 'flex'
      if (errEl) {
        errEl.textContent   = "Ce compte n'a pas accès à l'espace CDM."
        errEl.style.display = 'block'
      }
      return false
    }
    return true
  }

  // ── Authentification ──────────────────────────────────────────────
  window.CdmSite = {

    async checkAuth () {
      inject()
      const { data: { session } } = await db.auth.getSession()
      const loginScreen = document.getElementById('login-screen')

      if (!session) {
        if (loginScreen) loginScreen.style.display = 'flex'
        return
      }

      if (!(await grantAccessOrReject())) return

      if (loginScreen) loginScreen.style.display = 'none'
      if (typeof window.onCdmReady === 'function') {
        await window.onCdmReady()
      }
    },

    async login () {
      const email    = document.getElementById('login-email').value.trim()
      const password = document.getElementById('login-password').value.trim()
      const errEl    = document.getElementById('login-error')

      const { error } = await db.auth.signInWithPassword({ email, password })

      if (error) {
        errEl.textContent   = 'Identifiants incorrects.'
        errEl.style.display = 'block'
        return
      }

      if (!(await grantAccessOrReject())) return

      const loginScreen = document.getElementById('login-screen')
      if (loginScreen) loginScreen.style.display = 'none'

      if (typeof window.onCdmReady === 'function') {
        await window.onCdmReady()
      }
    },

    async logout () {
      await db.auth.signOut()
      window.location.href = 'cdm.html'
    },
  }

  // Lance l'init après chargement du DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CdmSite.checkAuth())
  } else {
    CdmSite.checkAuth()
  }

})()
