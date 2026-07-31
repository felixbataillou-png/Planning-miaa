/**
 * benevoles-admin.js
 * Logique de la page de gestion des bénévoles (vue admin).
 */

window.ADMIN_PAGE = 'benevoles'

// ── État ─────────────────────────────────────────────────────────
const PAGE_SIZE = 30
let allBenevoles    = []
let filteredList    = []
let currentPage     = 1
let editingId       = null
let pendingDeleteId = null

// ── Point d'entrée ───────────────────────────────────────────────
window.onAdminReady = async function () {
  await loadBenevoles()
}

// ── Chargement ───────────────────────────────────────────────────
async function loadBenevoles () {
  document.getElementById('benevoles-count').textContent = 'Chargement…'
  const { data, error } = await db
    .from('volunteers')
    .select('id, commentaires, nom, prenom, email, tel, permis, secu, profession, adresse, codepostal, ville, urgence_contact, rgpd')
    .order('nom', { ascending: true })

  if (error) {
    console.error(error)
    document.getElementById('benevoles-tbody').innerHTML =
      `<tr><td colspan="12" class="table-empty">Erreur de chargement.</td></tr>`
    return
  }

  allBenevoles = data || []
  filteredList = allBenevoles
  currentPage  = 1
  renderTable()
}

// ── Recherche ─────────────────────────────────────────────────────
let searchTimer = null
function handleSearch () {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    const q = document.getElementById('search-input').value.toLowerCase().trim()
    filteredList = !q ? allBenevoles : allBenevoles.filter(b =>
      [b.nom, b.prenom, b.email, b.tel, b.profession, b.ville, b.commentaires, b.urgence_contact]
        .some(v => v && String(v).toLowerCase().includes(q))
    )
    currentPage = 1
    renderTable()
  }, 250)
}

// ── Rendu du tableau ──────────────────────────────────────────────
function renderTable () {
  const total = filteredList.length
  const start = (currentPage - 1) * PAGE_SIZE
  const page  = filteredList.slice(start, Math.min(start + PAGE_SIZE, total))

  document.getElementById('benevoles-count').textContent =
    `${total} bénévole${total > 1 ? 's' : ''}`

  const tbody = document.getElementById('benevoles-tbody')

  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" class="table-empty">Aucun bénévole trouvé.</td></tr>`
    renderPagination(total)
    return
  }

  tbody.innerHTML = page.map(b => `
    <tr>
      <td>${esc(b.commentaires)}</td>
      <td><strong>${esc(b.nom)}</strong></td>
      <td>${esc(b.prenom)}</td>
      <td>${esc(b.email)}</td>
      <td>${esc(b.tel)}</td>
      <td style="text-align:center">
        ${b.permis
          ? '<i class="fas fa-check-circle permis-oui" aria-label="Permis : oui"></i>'
          : '<i class="fas fa-times-circle permis-non" aria-label="Permis : non"></i>'}
      </td>
      <td>${esc(b.profession)}</td>
      <td>${esc(b.adresse)}</td>
      <td>${esc(b.codepostal)}</td>
      <td>${esc(b.ville)}</td>
      <td>${esc(b.urgence_contact)}</td>
      <td class="td-actions" style="position:relative">
        <button class="btn-actions"
                aria-label="Actions pour ${esc(b.prenom)} ${esc(b.nom)}"
                aria-haspopup="true"
                aria-expanded="false"
                data-id="${b.id}"
                onclick="toggleMenu(event, '${b.id}')">
          <i class="fas fa-ellipsis-v" aria-hidden="true"></i>
        </button>
      </td>
    </tr>
  `).join('')

  renderPagination(total)
}

// ── Menu 3 points — positionné en fixed pour éviter le clipping ──
let activeMenuId  = null
let menuEl        = null

// Crée le menu une seule fois et le déplace dans le body
function initFloatingMenu () {
  if (document.getElementById('floating-actions-menu')) return
  const div = document.createElement('div')
  div.id = 'floating-actions-menu'
  div.className = 'actions-menu'
  div.setAttribute('role', 'menu')
  div.innerHTML = `
    <button role="menuitem" onclick="openEditModal(activeMenuId)">
      <i class="fas fa-pen" aria-hidden="true"></i> Modifier
    </button>
    <hr>
    <button class="danger" role="menuitem"
            onclick="openDeleteModal(activeMenuId, getBenevoleNameById(activeMenuId))">
      <i class="fas fa-trash" aria-hidden="true"></i> Supprimer
    </button>
  `
  document.body.appendChild(div)
  menuEl = div
}

function getBenevoleNameById (id) {
  const b = allBenevoles.find(v => v.id === id)
  return b ? `${b.prenom || ''} ${b.nom || ''}`.trim() : ''
}

function toggleMenu (e, id) {
  e.stopPropagation()
  initFloatingMenu()

  const btn    = e.currentTarget
  const isOpen = activeMenuId === id && menuEl.classList.contains('open')

  closeFloatingMenu()

  if (!isOpen) {
    activeMenuId = id
    const rect = btn.getBoundingClientRect()
    menuEl.style.position = 'fixed'
    menuEl.style.top      = `${rect.bottom + 4}px`
    menuEl.style.left     = `${rect.right - 140}px`
    menuEl.style.zIndex   = '1000'
    menuEl.classList.add('open')
    btn.setAttribute('aria-expanded', 'true')
  }
}

function closeFloatingMenu () {
  if (menuEl) menuEl.classList.remove('open')
  if (activeMenuId) {
    const btn = document.querySelector(`button[data-id="${activeMenuId}"]`)
    if (btn) btn.setAttribute('aria-expanded', 'false')
  }
  activeMenuId = null
}

document.addEventListener('click', e => {
  if (menuEl && !menuEl.contains(e.target)) closeFloatingMenu()
})

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeFloatingMenu()
})

// ── Pagination ────────────────────────────────────────────────────
function renderPagination (total) {
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const pag = document.getElementById('pagination')
  if (totalPages <= 1) { pag.innerHTML = ''; return }

  let html = `<button onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} aria-label="Page précédente">‹</button>`
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 2) {
      html += `<button onclick="goToPage(${i})"
        class="${i === currentPage ? 'active' : ''}"
        aria-label="Page ${i}" ${i === currentPage ? 'aria-current="page"' : ''}>${i}</button>`
    } else if (Math.abs(i - currentPage) === 3) {
      html += `<span style="padding:0 4px;color:#999">…</span>`
    }
  }
  html += `<button onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Page suivante">›</button>`
  html += `<span class="pagination-info">${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, total)} sur ${total}</span>`
  pag.innerHTML = html
}

function goToPage (page) {
  const totalPages = Math.ceil(filteredList.length / PAGE_SIZE)
  if (page < 1 || page > totalPages) return
  currentPage = page
  renderTable()
  document.getElementById('main-content').scrollIntoView({ behavior: 'smooth' })
}

// ── Modales ───────────────────────────────────────────────────────
function closeBvlModal (id) {
  document.getElementById(id).classList.remove('open')
  document.body.style.overflow = ''
}
function openBvlModal (id) {
  document.getElementById(id).classList.add('open')
  document.body.style.overflow = 'hidden'
}
function handleModalOverlayClick (e, id) {
  if (e.target === document.getElementById(id)) closeBvlModal(id)
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeBvlModal('modal-benevole')
    closeBvlModal('modal-confirm-delete')
  }
})

// ── Modale Ajouter ────────────────────────────────────────────────
function openAddModal () {
  editingId = null
  document.getElementById('modal-bvl-title').textContent = 'Ajouter un bénévole'
  resetBvlForm()
  openBvlModal('modal-benevole')
  setTimeout(() => document.getElementById('bvl-nom').focus(), 120)
}

// ── Modale Modifier ───────────────────────────────────────────────
function openEditModal (id) {
  closeFloatingMenu()
  const b = allBenevoles.find(v => v.id === id)
  if (!b) return

  editingId = id
  document.getElementById('modal-bvl-title').textContent = `Modifier — ${b.prenom || ''} ${b.nom || ''}`
  document.getElementById('bvl-nom').value           = b.nom             || ''
  document.getElementById('bvl-prenom').value        = b.prenom          || ''
  document.getElementById('bvl-email').value         = b.email           || ''
  document.getElementById('bvl-tel').value           = b.tel             || ''
  document.getElementById('bvl-secu').value          = b.secu            || ''
  document.getElementById('bvl-profession').value    = b.profession      || ''
  document.getElementById('bvl-adresse').value       = b.adresse         || ''
  document.getElementById('bvl-codepostal').value    = b.codepostal      || ''
  document.getElementById('bvl-ville').value         = b.ville           || ''
  document.getElementById('bvl-urgence').value       = b.urgence_contact || ''
  document.getElementById('bvl-commentaires').value  = b.commentaires    || ''
  document.getElementById('bvl-permis').checked      = b.permis          || false
  document.getElementById('bvl-rgpd').checked        = b.rgpd            || false

  ;['err-bvl-nom','err-bvl-prenom','err-bvl-email','err-bvl-secu'].forEach(id => {
    document.getElementById(id).style.display = 'none'
  })

  openBvlModal('modal-benevole')
}

function resetBvlForm () {
  ;['bvl-nom','bvl-prenom','bvl-email','bvl-tel','bvl-secu',
    'bvl-profession','bvl-adresse','bvl-codepostal','bvl-ville',
    'bvl-urgence','bvl-commentaires'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.value = ''
  })
  document.getElementById('bvl-permis').checked = false
  document.getElementById('bvl-rgpd').checked   = false
  ;['err-bvl-nom','err-bvl-prenom','err-bvl-email','err-bvl-secu'].forEach(id => {
    document.getElementById(id).style.display = 'none'
  })
}

// ── Enregistrer ───────────────────────────────────────────────────
async function saveBenévole () {
  const nom   = document.getElementById('bvl-nom').value.trim()
  const prenom = document.getElementById('bvl-prenom').value.trim()
  const email = document.getElementById('bvl-email').value.trim()
  const secu  = document.getElementById('bvl-secu').value.trim()

  let valid = true
  const checks = [
    { ok: nom.length > 0,                              errId: 'err-bvl-nom' },
    { ok: prenom.length > 0,                           errId: 'err-bvl-prenom' },
    { ok: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),   errId: 'err-bvl-email' },
    { ok: secu.length > 0,                             errId: 'err-bvl-secu' },
  ]
  checks.forEach(c => {
    document.getElementById(c.errId).style.display = c.ok ? 'none' : 'block'
    if (!c.ok) valid = false
  })
  if (!valid) return

  const btn = document.getElementById('btn-save-bvl')
  btn.disabled = true
  btn.textContent = 'Enregistrement…'

  const payload = {
    nom,
    prenom,
    email,
    tel:             document.getElementById('bvl-tel').value.trim(),
    secu,
    permis:          document.getElementById('bvl-permis').checked,
    rgpd:            document.getElementById('bvl-rgpd').checked,
    profession:      document.getElementById('bvl-profession').value.trim(),
    adresse:         document.getElementById('bvl-adresse').value.trim(),
    codepostal:      document.getElementById('bvl-codepostal').value.trim(),
    ville:           document.getElementById('bvl-ville').value.trim(),
    urgence_contact: document.getElementById('bvl-urgence').value.trim(),
    commentaires:    document.getElementById('bvl-commentaires').value.trim(),
  }

  const { error } = editingId
    ? await db.from('volunteers').update(payload).eq('id', editingId)
    : await db.from('volunteers').insert(payload)

  btn.disabled = false
  btn.innerHTML = '<i class="fas fa-save" aria-hidden="true"></i> Enregistrer'

  if (error) { showToast('red', 'Erreur lors de l\'enregistrement.'); console.error(error); return }

  closeBvlModal('modal-benevole')
  showToast('green', editingId ? 'Bénévole mis à jour.' : 'Bénévole ajouté.')
  await loadBenevoles()
}

// ── Suppression ───────────────────────────────────────────────────
function openDeleteModal (id, name) {
  closeFloatingMenu()
  pendingDeleteId = id
  document.getElementById('confirm-del-name').textContent = name
  openBvlModal('modal-confirm-delete')
}

async function confirmDelete () {
  if (!pendingDeleteId) return
  await db.from('registrations').delete().eq('volunteers_id', pendingDeleteId)
  const { error } = await db.from('volunteers').delete().eq('id', pendingDeleteId)
  closeBvlModal('modal-confirm-delete')
  pendingDeleteId = null
  if (error) { showToast('red', 'Erreur lors de la suppression.'); return }
  showToast('red', 'Bénévole supprimé.')
  await loadBenevoles()
}

// ── Toast ─────────────────────────────────────────────────────────
let toastTimer = null
function showToast (type, msg) {
  const el    = document.getElementById('toast')
  const msgEl = document.getElementById('toast-msg')
  msgEl.textContent = ''
  el.className = `toast toast-${type}`
  requestAnimationFrame(() => { msgEl.textContent = msg; el.classList.add('show') })
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000)
}

// ── Utilitaires ───────────────────────────────────────────────────
function esc (s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
