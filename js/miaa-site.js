/**
 * miaa-site.js
 * Composants transversaux du site MIAA.
 *
 * Ce fichier :
 *   1. Injecte le header, le footer et la sidebar via des balises custom
 *      (<miaa-header page="accueil">, <miaa-footer>, <miaa-sidebar>)
 *   2. Gère le menu mobile (ouverture/fermeture)
 *   3. Gère les sous-menus desktop : hover avec délai anti-fermeture prématurée
 *      ET navigation au clavier (flèches, Entrée, Échap) — RGAA 12.6 / 12.7
 *
 * Utilisation dans une page HTML :
 *   <miaa-header page="accueil"></miaa-header>
 *   <miaa-sidebar></miaa-sidebar>
 *   <miaa-footer></miaa-footer>
 *   <script src="js/miaa-site.js"></script>
 *
 * Valeurs valides pour l'attribut page :
 *   accueil | association | contact | inscription | newsletter
 */

;(function () {

  // ── Structure de navigation ────────────────────────────────────
  const NAV = [
    { label: 'Accueil',     href: 'index.html',       key: 'accueil' },
    {
      label: 'Association', href: '#',                 key: 'association',
      children: [
        { label: 'Informations pratiques', href: 'informations-pratiques.html' },
        { label: 'Équipe',                 href: 'equipe.html' },
        { label: 'Partenaires',            href: 'partenaires.html' },
        { label: 'Presse et Médias',       href: 'presse-medias.html' },
        { label: 'RGPD',                   href: 'rgpd.html' },
      ]
    },
    { label: 'Contact',     href: 'contact.html',     key: 'contact' },
    { label: 'Inscription', href: 'inscription.html', key: 'inscription' },
    { label: 'Newsletters', href: 'newsletter-liste.html', key: 'newsletter' },
  ]

  // ── Construction du HTML du header ────────────────────────────
  function buildHeader (activePage) {
    const currentFile = window.location.pathname.split('/').pop() || 'index.html'

    const navItems = NAV.map((link, i) => {
      const isActive = link.key === activePage ||
        (link.children && link.children.some(c => c.href === currentFile))

      if (link.children) {
        const subs = link.children.map(c => {
          const isCurrent = c.href === currentFile
          return `<li role="none">
            <a href="${c.href}" role="menuitem" tabindex="-1"
               ${isCurrent ? 'aria-current="page"' : ''}>
              ${c.label}
            </a>
          </li>`
        }).join('')

        return `<li role="none" class="${isActive ? 'open' : ''}">
          <a href="${link.href}"
             role="menuitem"
             aria-haspopup="true"
             aria-expanded="${isActive ? 'true' : 'false'}"
             ${isActive ? 'class="active"' : ''}>
            ${link.label}
            <i class="fas fa-chevron-down chevron" aria-hidden="true"></i>
          </a>
          <ul class="subnav" role="menu" aria-label="${link.label}">${subs}</ul>
        </li>`
      }

      return `<li role="none">
        <a href="${link.href}" role="menuitem"
           ${isActive ? 'class="active" aria-current="page"' : ''}>
          ${link.label}
        </a>
      </li>`
    }).join('')

    const mobileLinks = NAV.map(link => {
      let html = `<a href="${link.href}">${link.label}</a>`
      if (link.children) {
        html += link.children.map(c =>
          `<a href="${c.href}" class="sub-link">— ${c.label}</a>`
        ).join('')
      }
      return html
    }).join('')

    return `
      <a href="#main-content" class="skip-link">Aller au contenu principal</a>

      <div class="topbar">
        <a href="https://www.facebook.com/pages/Association-MIAA/377808022330859"
           target="_blank" rel="noopener"
           aria-label="Page Facebook de l'association MIAA (nouvel onglet)">
          <i class="fab fa-facebook-f" aria-hidden="true"></i>
        </a>
        <a href="https://www.instagram.com/associationmiaa"
           target="_blank" rel="noopener"
           aria-label="Page Instagram de l'association MIAA (nouvel onglet)">
          <i class="fab fa-instagram" aria-hidden="true"></i>
        </a>
      </div>

      <header class="site-header">
        <a href="index.html" aria-label="Accueil MIAA – retour à la page d'accueil">
          <img class="logo" src="assets/logo.png" alt="MIAA — Mouvement d'Intermittents d'Aide aux Autres">
        </a>

        <nav aria-label="Navigation principale">
          <ul class="site-nav" role="menubar" aria-label="Menu principal">
            ${navItems}
          </ul>
        </nav>

        <button class="burger" id="burger-btn"
                type="button"
                aria-label="Ouvrir le menu de navigation"
                aria-expanded="false"
                aria-controls="mobile-menu">
          <i class="fas fa-bars" aria-hidden="true"></i>
        </button>
      </header>

      <div class="mobile-menu" id="mobile-menu"
           role="dialog"
           aria-label="Menu de navigation mobile"
           aria-modal="true"
           tabindex="-1">
        <button class="mobile-menu-close"
                type="button"
                aria-label="Fermer le menu">
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
        <nav aria-label="Navigation mobile">${mobileLinks}</nav>
      </div>`
  }

  // ── Footer ────────────────────────────────────────────────────
  function buildFooter () {
    return `
      <footer class="site-footer" role="contentinfo">
        <span>MIAA — 14, rue des Carrières d'Amérique 75019 Paris —
          <a href="mailto:miaa@miaa.fr">miaa@miaa.fr</a> —
          © Miaa 2026
        </span>
      </footer>`
  }

  // ── Sidebar donation ──────────────────────────────────────────
  function buildSidebar () {
    return `
      <aside class="sidebar" aria-label="Faire un don à MIAA">
        <div class="donation-box">
          <p><strong>Faites un don !</strong></p>
          <p>5 € par mois<br>c'est 40 repas par an</p>
          <p>Pour donner via HelloAsso :</p>
          <a href="https://tinyurl.com/donmiaahelloasso"
             target="_blank" rel="noopener"
             aria-label="Faire un don à MIAA via HelloAsso (nouvel onglet)">
            Faire un don
          </a>
          <img src="assets/thumbnail.png"
               alt="QR code pour faire un don à MIAA via HelloAsso"
               width="180" height="180">
          <p>Vous pouvez aussi nous donner vos vêtements et produits d'hygiène, ou encore vos reliquats de fin de tournage.</p>
          <p><strong>MIAA vous remercie de votre aide.</strong></p>
        </div>
      </aside>`
  }

  // ── Injection des composants ──────────────────────────────────
  function inject () {
    document.querySelectorAll('miaa-header').forEach(el => {
      const page = el.getAttribute('page') || ''
      const wrapper = document.createElement('div')
      wrapper.innerHTML = buildHeader(page)
      el.replaceWith(...wrapper.childNodes)
    })
    document.querySelectorAll('miaa-footer').forEach(el => {
      const wrapper = document.createElement('div')
      wrapper.innerHTML = buildFooter()
      el.replaceWith(...wrapper.childNodes)
    })
    document.querySelectorAll('miaa-sidebar').forEach(el => {
      const wrapper = document.createElement('div')
      wrapper.innerHTML = buildSidebar()
      el.replaceWith(...wrapper.childNodes)
    })

    // Init des comportements après injection
    initDropdowns()
    initMobileMenu()
    applyHeroImages()
  }

  // ── Photos d'en-tête (CMS, une par page) ───────────────────────
  // La page pose <div class="hero" data-hero-key="inscription">... ; si le
  // CMS ne fournit rien pour cette clé, la photo par défaut (définie en CSS
  // dans .hero) reste inchangée.
  function applyHeroImages () {
    const heroes = document.querySelectorAll('.hero[data-hero-key]')
    if (heroes.length === 0) return

    fetch('_content/hero-images.json')
      .then(r => r.json())
      .then(images => {
        heroes.forEach(el => {
          const key = el.getAttribute('data-hero-key')
          const url = images[key]
          if (url) el.style.backgroundImage = `url('${url}')`
        })
      })
      .catch(() => {}) // pas de photo personnalisée trouvée : garde la valeur par défaut du CSS
  }

  // ── Sous-menus desktop : hover avec délai anti-fermeture ──────
  //
  // Problème classique : quand on quitte le lien parent pour descendre
  // vers le sous-menu, il y a un micro-gap (quelques px) où ni le parent
  // ni le sous-menu ne sont survolés → le sous-menu disparaît.
  //
  // Solution : on attend 120 ms avant de fermer. Si la souris est entrée
  // sur le sous-menu entre-temps, on annule la fermeture.
  //
  function initDropdowns () {
    const items = document.querySelectorAll('.site-nav > li')

    items.forEach(li => {
      const subnav = li.querySelector('.subnav')
      if (!subnav) return

      const trigger = li.querySelector('a[aria-haspopup]')
      let closeTimer = null

      function openMenu () {
        clearTimeout(closeTimer)
        // Ferme tous les autres sous-menus
        items.forEach(other => {
          if (other !== li) closeItem(other)
        })
        li.classList.add('open')
        if (trigger) trigger.setAttribute('aria-expanded', 'true')
      }

      function scheduleClose () {
        closeTimer = setTimeout(() => closeItem(li), 120)
      }

      function cancelClose () {
        clearTimeout(closeTimer)
      }

      li.addEventListener('mouseenter', openMenu)
      li.addEventListener('mouseleave', scheduleClose)
      subnav.addEventListener('mouseenter', cancelClose)
      subnav.addEventListener('mouseleave', scheduleClose)

      // ── Navigation clavier (RGAA 12.6 / 12.7) ────────────────
      // Entrée/Espace sur le lien parent : ouvre/ferme le sous-menu
      if (trigger) {
        trigger.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (li.classList.contains('open')) {
              closeItem(li)
              trigger.focus()
            } else {
              openMenu()
              // Focus sur le premier lien du sous-menu
              const first = subnav.querySelector('a')
              if (first) first.focus()
            }
          }
          // Flèche bas : ouvre et focus sur le premier item
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            openMenu()
            const first = subnav.querySelector('a')
            if (first) first.focus()
          }
          // Échap : ferme si ouvert
          if (e.key === 'Escape') {
            closeItem(li)
            trigger.focus()
          }
        })
      }

      // Navigation dans le sous-menu : flèches haut/bas, Échap
      subnav.addEventListener('keydown', e => {
        const links = Array.from(subnav.querySelectorAll('a'))
        const idx = links.indexOf(document.activeElement)

        if (e.key === 'ArrowDown') {
          e.preventDefault()
          const next = links[idx + 1] || links[0]
          next.focus()
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          const prev = links[idx - 1] || links[links.length - 1]
          prev.focus()
        }
        if (e.key === 'Escape') {
          closeItem(li)
          if (trigger) trigger.focus()
        }
        if (e.key === 'Tab') {
          // Tab sort du sous-menu → on le ferme
          closeItem(li)
        }
      })
    })

    // Clic en dehors : ferme tous les sous-menus
    document.addEventListener('click', e => {
      if (!e.target.closest('.site-nav')) {
        items.forEach(li => closeItem(li))
      }
    })
  }

  function closeItem (li) {
    li.classList.remove('open')
    const trigger = li.querySelector('a[aria-haspopup]')
    if (trigger) trigger.setAttribute('aria-expanded', 'false')
  }

  // ── Menu mobile ───────────────────────────────────────────────
  function initMobileMenu () {
    const burger = document.getElementById('burger-btn')
    const menu   = document.getElementById('mobile-menu')
    if (!burger || !menu) return

    const closeBtn = menu.querySelector('.mobile-menu-close')

    burger.addEventListener('click', openMobileMenu)
    if (closeBtn) closeBtn.addEventListener('click', closeMobileMenu)

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && menu.classList.contains('open')) {
        closeMobileMenu()
      }
    })
  }

  function openMobileMenu () {
    const menu   = document.getElementById('mobile-menu')
    const burger = document.getElementById('burger-btn')
    if (!menu || !burger) return
    menu.classList.add('open')
    burger.setAttribute('aria-expanded', 'true')
    document.body.style.overflow = 'hidden'
    // Focus sur le bouton de fermeture pour l'accessibilité
    const closeBtn = menu.querySelector('.mobile-menu-close')
    if (closeBtn) setTimeout(() => closeBtn.focus(), 50)
  }

  function closeMobileMenu () {
    const menu   = document.getElementById('mobile-menu')
    const burger = document.getElementById('burger-btn')
    if (!menu || !burger) return
    menu.classList.remove('open')
    burger.setAttribute('aria-expanded', 'false')
    document.body.style.overflow = ''
    burger.focus()
  }

  // ── Lancement ─────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject)
  } else {
    inject()
  }

  // Netlify Identity — force l'URL native pour l'authentification CMS
  window.netlifyIdentityUrl = "https://verdant-phoenix-e415b1.netlify.app";

})()
