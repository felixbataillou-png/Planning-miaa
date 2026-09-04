/**
 * admin-site.js
 * Composants communs à toutes les pages de l'espace admin MIAA.
 *
 * Gère :
 *   - L'écran de connexion (auth Supabase partagée entre toutes les pages admin)
 *   - Le header admin avec navigation entre les pages
 *   - La déconnexion
 *
 * Usage : charger ce fichier AVANT le JS spécifique à chaque page admin.
 * La page appelante doit définir :
 *   - window.ADMIN_PAGE = 'planning' | 'benevoles' (pour le lien actif dans la nav)
 *   - window.onAdminReady = async function() { ... } (appelée une fois connecté)
 *
 * Dépendances :
 *   - @supabase/supabase-js v2 (CDN)
 *   - js/supabase-config.js → db
 */

;(function () {

  // ── Navigation admin ─────────────────────────────────────────────
  const ADMIN_NAV = [
    { key: 'planning',   label: 'Planning',   href: 'planning-admin.html', icon: 'fa-calendar-alt' },
    { key: 'benevoles',  label: 'Bénévoles',  href: 'benevoles-admin.html', icon: 'fa-users' },
  ]

  // ── Construction du HTML du header admin ─────────────────────────
  function buildAdminHeader (activePage) {
    const navItems = ADMIN_NAV.map(item => {
      const isActive = item.key === activePage
      return `<a href="${item.href}" class="${isActive ? 'active' : ''}"
                 ${isActive ? 'aria-current="page"' : ''}
                 aria-label="${item.label}">
        <i class="fas ${item.icon}" aria-hidden="true"></i>
        ${item.label}
      </a>`
    }).join('')

    return `
      <div class="topbar">
        <div class="topbar-admin-badge">
          <i class="fas fa-shield-alt" aria-hidden="true"></i> Espace Administration
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
        <a href="planning-admin.html" aria-label="Espace admin MIAA">
          <img class="logo" src="assets/logo.png" alt="MIAA">
        </a>
        <nav class="admin-nav" aria-label="Navigation administration">
          ${navItems}
        </nav>
        <div class="header-right">
          <button onclick="AdminSite.logout()" class="btn-secondary"
              style="font-size:12px;padding:6px 14px"
              aria-label="Se déconnecter de l'espace administration">
            <i class="fas fa-sign-out-alt" aria-hidden="true"></i> Déconnexion
          </button>
        </div>
        <button class="burger" id="admin-burger-btn" type="button"
              aria-label="Ouvrir le menu de navigation"
              aria-expanded="false"
              aria-controls="admin-mobile-menu"
              onclick="AdminSite.openMobileMenu()">
           <i class="fas fa-bars" aria-hidden="true"></i>
        </button>
      </header>

      <div class="mobile-menu" id="admin-mobile-menu"
            role="dialog" aria-label="Menu de navigation administration" aria-modal="true">
          <button class="mobile-menu-close" type="button"
              aria-label="Fermer le menu"
              onclick="AdminSite.closeMobileMenu()">
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
          <nav>
            ${ADMIN_NAV.map(item => `
              <a href="${item.href}" class="${item.key === activePage ? 'active' : ''}">
                <i class="fas ${item.icon}" aria-hidden="true"></i> ${item.label}
              </a>
            `).join('')}
            <a href="#" onclick="AdminSite.logout(); return false;" style="color:#E51700">
              <i class="fas fa-sign-out-alt" aria-hidden="true"></i> Déconnexion
            </a>
          </nav>
      </div>`
  }

  // ── Écran de connexion ────────────────────────────────────────────
  function buildLoginScreen () {
    return `
      <div id="login-screen" class="login-screen">
        <div class="login-card">
          <h2 class="login-title">MIAA — Espace Admin</h2>
          <p class="login-subtitle">Connexion sécurisée</p>
          <div id="login-step-email">
            <div class="form-group">
              <label for="login-email">Adresse email</label>
              <input type="email" id="login-email" placeholder="admin@miaa.fr">
            </div>
            <div class="form-group">
              <label for="login-password">Mot de passe</label>
              <input type="password" id="login-password" placeholder="••••••••">
            </div>
            <button class="btn-primary btn-full" onclick="AdminSite.login()">
              Se connecter
            </button>
            <p id="login-error" class="login-error"></p>
          </div>
        </div>
      </div>`
  }

  // ── Injection du header ───────────────────────────────────────────
  function inject () {
    const activePage = window.ADMIN_PAGE || 'planning'

    // Écran de connexion
    const loginEl = document.getElementById('login-screen')
    if (!loginEl) {
      const wrapper = document.createElement('div')
      wrapper.innerHTML = buildLoginScreen()
      document.body.insertBefore(wrapper.firstElementChild, document.body.firstChild)
    }

    // Header admin
    const headerEl = document.querySelector('admin-header')
    if (headerEl) {
      const wrapper = document.createElement('div')
      wrapper.innerHTML = buildAdminHeader(activePage)
      headerEl.replaceWith(...wrapper.childNodes)
    }

    watchStickyHeaderHeight()
  }

  /** Expose la hauteur réelle du bandeau fixe (topbar + header, tous deux en
   * position:sticky) dans --sticky-header-height, pour que d'autres éléments
   * (ex : l'en-tête de chaque jour sur planning-admin) puissent se coller
   * juste en dessous plutôt que sous une valeur codée en dur — la hauteur du
   * header est en mode "hug" (dépend du logo/du contenu), pas fixe.
   * ResizeObserver plutôt qu'un seul calcul : réagit aussi au chargement
   * asynchrone du logo ou à un changement de breakpoint. */
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

  // ── Authentification ──────────────────────────────────────────────
  window.AdminSite = {

    async checkAuth () {
      inject()
      const { data: { session } } = await db.auth.getSession()
      const loginScreen = document.getElementById('login-screen')
      if (session) {
        if (loginScreen) loginScreen.style.display = 'none'
        if (typeof window.onAdminReady === 'function') {
          await window.onAdminReady()
        }
      } else {
        if (loginScreen) loginScreen.style.display = 'flex'
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

      const loginScreen = document.getElementById('login-screen')
      if (loginScreen) loginScreen.style.display = 'none'

      if (typeof window.onAdminReady === 'function') {
        await window.onAdminReady()
      }
    },

    async logout () {
      await db.auth.signOut()
      window.location.href = 'planning-admin.html'
    },

    openMobileMenu () {
      const menu = document.getElementById('admin-mobile-menu')
      const btn  = document.getElementById('admin-burger-btn')
      if (menu) menu.classList.add('open')
      if (btn)  btn.setAttribute('aria-expanded', 'true')
      document.body.style.overflow = 'hidden'
    },
    
    closeMobileMenu () {
      const menu = document.getElementById('admin-mobile-menu')
      const btn  = document.getElementById('admin-burger-btn')
      if (menu) menu.classList.remove('open')
      if (btn)  btn.setAttribute('aria-expanded', 'false')
      document.body.style.overflow = ''
    }
  }

  // Lance l'init après chargement du DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AdminSite.checkAuth())
  } else {
    AdminSite.checkAuth()
  }

})()
