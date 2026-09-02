/**
 * galerie-photo.js
 * Carrousels (défilement borné, pas de boucle) + lightbox, pilotés par
 * _content/galerie.json (CMS : collection "Galerie photo").
 *
 * Défilement : scroll natif (souris/tactile/trackpad) ET chevrons, borné
 * — impossible d'aller au-delà de la première ou de la dernière photo, les
 * chevrons se désactivent en bout de piste. Une marge invisible est ajoutée
 * en fin de piste pour que la dernière photo puisse tout de même atteindre
 * la même position de repos que les autres (sinon le scroll est plafonné
 * avant, et la dernière photo reste coincée contre le bord droit).
 */

;(function () {

  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

  /** Anime le scroll horizontal à la main (rAF + ease-out) plutôt que de
   * s'appuyer sur `behavior:'smooth'`, qui n'anime pas de façon fiable une
   * fois combiné à `scroll-snap-type` sur certains navigateurs (le scroll
   * reste bloqué à sa position de départ). */
  function smoothScrollTo(el, target, duration = 320) {
    const start = el.scrollLeft
    const change = target - start
    if (change === 0) return
    const startTime = performance.now()
    function step(now) {
      const t = Math.min(1, (now - startTime) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      el.scrollLeft = start + change * eased
      if (t < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  // ── Lightbox (une seule instance, partagée par tous les carrousels) ──
  let lightboxCarousel = null // { photos, index } — carrousel actuellement ouvert dans la lightbox

  function initLightbox() {
    const lightbox  = document.getElementById('lightbox')
    const currentImg = lightbox.querySelector('.lightbox__current')
    const prevPeek   = lightbox.querySelector('.lightbox__peek--prev')
    const nextPeek   = lightbox.querySelector('.lightbox__peek--next')
    const closeBtn   = lightbox.querySelector('.lightbox__close')
    const prevBtn    = lightbox.querySelector('.lightbox__nav--prev')
    const nextBtn    = lightbox.querySelector('.lightbox__nav--next')

    function render() {
      const { photos, index } = lightboxCarousel
      const n = photos.length
      const prevIndex = (index - 1 + n) % n
      const nextIndex = (index + 1) % n

      currentImg.src = photos[index].image
      currentImg.alt = photos[index].legende || ''
      prevPeek.src = photos[prevIndex].image
      prevPeek.alt = ''
      nextPeek.src = photos[nextIndex].image
      nextPeek.alt = ''

      // Une seule photo : pas d'aperçus voisins (identiques à la photo courante)
      const showPeeks = n > 1
      prevPeek.style.visibility = showPeeks ? '' : 'hidden'
      nextPeek.style.visibility = showPeeks ? '' : 'hidden'
      prevBtn.style.visibility  = showPeeks ? '' : 'hidden'
      nextBtn.style.visibility  = showPeeks ? '' : 'hidden'
    }

    function open(photos, index) {
      lightboxCarousel = { photos, index }
      render()
      lightbox.hidden = false
      document.body.style.overflow = 'hidden'
      closeBtn.focus()
    }

    function close() {
      lightbox.hidden = true
      lightboxCarousel = null
      document.body.style.overflow = ''
    }

    function step(dir) {
      if (!lightboxCarousel) return
      const n = lightboxCarousel.photos.length
      lightboxCarousel.index = (lightboxCarousel.index + dir + n) % n
      render()
    }

    closeBtn.addEventListener('click', close)
    prevBtn.addEventListener('click', () => step(-1))
    nextBtn.addEventListener('click', () => step(1))
    prevPeek.addEventListener('click', () => step(-1))
    nextPeek.addEventListener('click', () => step(1))

    // Clic en dehors de la photo (mais dans la lightbox) = fermeture
    lightbox.addEventListener('click', e => {
      if (e.target === lightbox) close()
    })

    document.addEventListener('keydown', e => {
      if (lightbox.hidden) return
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    })

    return { open }
  }

  // ── Un carrousel ──────────────────────────────────────────────────
  function buildCarousel(carrousel, lightboxApi) {
    const photos = carrousel.photos || []
    if (photos.length === 0) return null

    const section = document.createElement('section')
    section.className = 'carousel'
    section.setAttribute('aria-label', carrousel.titre || 'Carrousel photo')

    const n = photos.length

    const itemsHtml = photos.map((p, i) => `
      <button type="button" class="carousel__item" data-dom-index="${i}"
        aria-label="${esc(p.legende) || 'Voir la photo en grand'}">
        <img src="${esc(p.image)}" alt="${esc(p.legende)}" loading="lazy">
      </button>`).join('')

    section.innerHTML = `
      <h2 class="carousel__title">${esc(carrousel.titre)}</h2>
      <div class="carousel__viewport">
        <button type="button" class="carousel__nav carousel__nav--prev" aria-label="Photo précédente — ${esc(carrousel.titre)}">
          <i class="fas fa-chevron-left" aria-hidden="true"></i>
        </button>
        <div class="carousel__track" tabindex="0" role="group" aria-label="Photos — ${esc(carrousel.titre)}">
          ${itemsHtml}
        </div>
        <button type="button" class="carousel__nav carousel__nav--next" aria-label="Photo suivante — ${esc(carrousel.titre)}">
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>`

    const track   = section.querySelector('.carousel__track')
    const prevBtn = section.querySelector('.carousel__nav--prev')
    const nextBtn = section.querySelector('.carousel__nav--next')
    const items   = Array.from(track.querySelectorAll('.carousel__item'))

    // Masque les chevrons si une seule photo (rien à faire défiler)
    if (n <= 1) {
      prevBtn.style.display = 'none'
      nextBtn.style.display = 'none'
    }

    // Marge invisible en fin de piste : sans elle, le navigateur ne peut pas
    // faire défiler assez loin pour aligner la toute dernière photo contre
    // le bord gauche (le scroll est plafonné par scrollWidth - clientWidth,
    // qui s'arrête avant d'atteindre cette position dès qu'il n'y a plus
    // d'autres photos après pour "pousser"). Cette marge remplace les
    // photos suivantes qui n'existent pas, pour que la dernière atteigne
    // la même position de repos que toutes les autres.
    const spacer = document.createElement('div')
    spacer.className = 'carousel__spacer'
    spacer.setAttribute('aria-hidden', 'true')
    track.appendChild(spacer)

    function itemStep() {
      const first = items[0]
      const second = items[1] || items[0]
      const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || '0')
      return second.getBoundingClientRect().left - first.getBoundingClientRect().left || (first.offsetWidth + gap)
    }

    function updateSpacer() {
      const itemW = items[0].getBoundingClientRect().width
      spacer.style.width = Math.max(0, track.clientWidth - itemW) + 'px'
    }

    // Index "voulu" — pas déduit de scrollLeft, pour rester correct même si
    // une mesure de layout a échoué entre-temps (ex. onglet non visible).
    let currentIndex = 0

    function updateNavState() {
      prevBtn.disabled = currentIndex <= 0
      nextBtn.disabled = currentIndex >= n - 1
    }

    function goToIndex(index, smooth) {
      currentIndex = Math.max(0, Math.min(n - 1, index))
      updateNavState()
      const target = currentIndex * itemStep()
      if (smooth) smoothScrollTo(track, target)
      else track.scrollLeft = target
    }

    // Garde currentIndex synchronisé quand l'utilisateur défile "à la main"
    // (souris/tactile/trackpad), pour que les chevrons se désactivent au bon
    // moment même sans être passés par eux.
    let settleTimer = null
    track.addEventListener('scroll', () => {
      clearTimeout(settleTimer)
      settleTimer = setTimeout(() => {
        const step = itemStep()
        if (!step) return
        currentIndex = Math.max(0, Math.min(n - 1, Math.round(track.scrollLeft / step)))
        updateNavState()
      }, 120)
    }, { passive: true })

    prevBtn.addEventListener('click', () => goToIndex(currentIndex - 1, true))
    nextBtn.addEventListener('click', () => goToIndex(currentIndex + 1, true))

    track.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goToIndex(currentIndex - 1, true) }
      if (e.key === 'ArrowRight') { e.preventDefault(); goToIndex(currentIndex + 1, true) }
    })

    items.forEach((btn, index) => {
      btn.addEventListener('click', () => lightboxApi.open(photos, index))
    })

    // Repositionne (sans animation) chaque fois que la piste a réellement une
    // taille — pas seulement au redimensionnement de fenêtre : couvre aussi
    // le cas où la page se charge dans un onglet non visible (largeur 0 au
    // premier rendu), qui donnerait sinon un positionnement figé sur 0.
    let relayoutTimer = null
    const ro = new ResizeObserver(() => {
      clearTimeout(relayoutTimer)
      relayoutTimer = setTimeout(() => {
        if (!track.clientWidth) return // toujours pas visible : rien à mesurer
        updateSpacer()
        goToIndex(currentIndex, false)
      }, 100)
    })
    ro.observe(track)

    function relayoutIfReady() {
      if (!track.clientWidth) return false
      updateSpacer()
      goToIndex(currentIndex, false)
      return true
    }

    // Positionnement initial : le ResizeObserver ci-dessus couvre en principe
    // ce cas, mais si la page se charge dans un onglet pas encore affiché
    // (largeur 0 au premier rendu), certains navigateurs ne redéclenchent
    // rien tout seuls. Deux filets de sécurité, chacun indépendant de
    // requestAnimationFrame (lui-même suspendu tant que l'onglet est masqué,
    // donc pas fiable pour "réagir à l'affichage") :
    //  - setTimeout : re-tente à intervalle fixe, indépendamment de la
    //    visibilité de l'onglet ;
    //  - "visibilitychange" : redéclenche dès que l'onglet redevient visible,
    //    sans attendre le prochain tick du setTimeout.
    let initTries = 0
    ;(function tryInit() {
      if (relayoutIfReady()) return
      if (initTries++ < 100) setTimeout(tryInit, 100)
    })()
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) relayoutIfReady()
    })

    return section
  }

  // ── Chargement depuis le CMS ────────────────────────────────────
  function render(data, lightboxApi) {
    const container = document.getElementById('carousels')
    const carrousels = data.carrousels || []
    const withPhotos = carrousels.filter(c => (c.photos || []).length > 0)

    if (withPhotos.length === 0) {
      container.innerHTML = '<p>Aucune photo pour le moment.</p>'
      return
    }

    container.innerHTML = ''
    withPhotos.forEach(c => {
      const el = buildCarousel(c, lightboxApi)
      if (el) container.appendChild(el)
    })
  }

  function init() {
    const lightboxApi = initLightbox()
    fetch('_content/galerie.json')
      .then(r => r.json())
      .then(data => render(data, lightboxApi))
      .catch(() => {
        document.getElementById('carousels').innerHTML =
          '<p>Impossible de charger la galerie. Merci de réessayer.</p>'
      })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

})()
