/**
 * benevoles-admin.js
 * Logique de la page de gestion des bénévoles (vue admin).
 *
 * Dépendances :
 *   - @supabase/supabase-js v2 (CDN)
 *   - js/supabase-config.js → db
 *   - js/admin-site.js → AdminSite, auth partagée
 */

// ── Page active pour la nav admin ────────────────────────────────
window.ADMIN_PAGE = 'benevoles'

// ── État ─────────────────────────────────────────────────────────
const PAGE_SIZE = 30
let allBenevoles   = []   // tous les bénévoles chargés
let filteredList   = []   // après recherche
let currentPage    = 1
let editingId      = null // id du bénévole en cours d'édition (null = ajout)
let pendingDeleteId = null
let activeMenu     = null // menu 3 points actuellement ouvert

// ── Point d'entrée appelé par admin-site.js ───────────────────────
window.onAdminReady = async function () {
  await loadBenevoles()
}

// ── Chargement des données ────────────────────────────────────────
async function loadBenevoles () {
  document.getElementById('benevoles-count').textContent = 'Chargement…'

  const { data, error } = await db
    .from('volunteers')
    .select('id, commentaires, nom, prenom, email, tel, permis, profession, adresse, codepostal, ville, urgence_contact')
    .order('nom', { ascending: true })

  if (error) {
    document.getElementById('benevoles-tbody').innerHTML =
      `<tr><td colspan="12" class="table-empty">Erreur de chargement.</td></tr>`
    return
  }

  allBenevoles  = data || []
  filteredList  = allBenevoles
  currentPage   = 1
  renderTable()
}

// ── Recherche ─────────────────────────────────────────────────────
let searchTimer = null
function handleSearch () {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    const q = document.getElementById('search-input').value.toLowerCase().trim()
    if (!q) {
      filteredList = allBenevoles
    } else {
      filteredList = allBenevoles.filter(b =>
        [b.nom, b.prenom, b.email, b.tel, b.profession, b.ville, b.commentaires, b.urgence_contact]
          .some(v => v && String(v).toLowerCase().includes(q))
      )
    }
    currentPage = 1
    renderTable()
  }, 250)
}

// ── Rendu du tableau ──────────────────────────────────────────────
function renderTable () {
  const total  = filteredList.length
  const start  = (currentPage - 1) * PAGE_SIZE
  const end    = Math.min(start + PAGE_SIZE, total)
  const page   = filteredList.slice(start, end)

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
      <td title="${esc(b.commentaires)}">${esc(truncate(b.commentaires, 30))}</td>
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
      <td title="${esc(b.adresse)}">${esc(truncate(b.adresse, 25))}</td>
      <td>${esc(b.codepostal)}</td>
      <td>${esc(b.ville)}</td>
      <td title="${esc(b.urgence_contact)}">${esc(truncate(b.urgence_contact, 25))}</td>
      <td class="td-actions">
        <button class="btn-actions"
                aria-label="Actions pour ${esc(b.prenom)} ${esc(b.nom)}"
                onclick="toggleMenu(event, '${b.id}')">
          <i class="fas fa-ellipsis-v" aria-hidden="true"></i>
        </button>
        <div class="actions-menu" id="menu-${b.id}">
          <button onclick="openEditModal('${b.id}')">
            <i class="fas fa-pen" aria-hidden="true"></i> Modifier
          </button>
          <hr>
          <button class="danger" onclick="openDeleteModal('${b.id}', '${esc(b.prenom)} ${esc(b.nom)}')">
            <i class="fas fa-trash" aria-hidden="true"></i> Supprimer
          </button>
        </div>
      </td>
    </tr>
  `).join('')

  renderPagination(total)
}

// ── Pagination ────────────────────────────────────────────────────
function renderPagination (total) {
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const pag = document.getElementById('pagination')

  if (totalPages <= 1) { pag.innerHTML = ''; return }

  let html = `<button onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 2) {
      html += `<button onclick="goToPage(${i})" class="${i === currentPage ? 'active' : ''}">${i}</button>`
    } else if (Math.abs(i - currentPage) === 3) {
      html += `<span style="padding:0 4px;color:#999">…</span>`
    }
  }

  html += `<button onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>›</button>`
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

// ── Menu 3 points ─────────────────────────────────────────────────
function toggleMenu (e, id) {
  e.stopPropagation()
  const menu = document.getElementById(`menu-${id}`)
  if (activeMenu && activeMenu !== menu) activeMenu.classList.remove('open')
  menu.classList.toggle('open')
  activeMenu = menu.classList.contains('open') ? menu : null
}

document.addEventListener('click', () => {
  if (activeMenu) { activeMenu.classList.remove('open'); activeMenu = null }
})

// ── Modales ───────────────────────────────────────────────────────
function closeModal (id) {
  document.getElementById(id).classList.remove('open')
  document.body.style.overflow = ''
}

function openModal (id) {
  document.getElementById(id).classList.add('open')
  document.body.style.overflow = 'hidden'
}

function handleModalOverlayClick (e, id) {
  if (e.target === document.getElementById(id)) closeModal(id)
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal('modal-benevole')
    closeModal('modal-confirm-delete')
  }
})

// ── Modale Ajouter ────────────────────────────────────────────────
function openAddModal () {
  editingId = null
  document.getElementById('modal-bvl-title').textContent = 'Ajouter un bénévole'
  resetBvlForm()
  openModal('modal-benevole')
  setTimeout(() => document.getElementById('bvl-nom').focus(), 120)
}

// ── Modale Modifier ───────────────────────────────────────────────
function openEditModal (id) {
  if (activeMenu) { activeMenu.classList.remove('open'); activeMenu = null }
  const b = allBenevoles.find(v => v.id === id)
  if (!b) return

  editingId = id
  document.getElementById('modal-bvl-title').textContent = `Modifier — ${b.prenom || ''} ${b.nom || ''}`
  document.getElementById('bvl-commentaires').value  = b.commentaires    || ''
  document.getElementById('bvl-nom').value          = b.nom            || ''
  document.getElementById('bvl-prenom').value       = b.prenom         || ''
  document.getElementById('bvl-email').value        = b.email          || ''
  document.getElementById('bvl-tel').value          = b.tel            || ''
  document.getElementById('bvl-profession').value   = b.profession     || ''
  document.getElementById('bvl-adresse').value      = b.adresse        || ''
  document.getElementById('bvl-codepostal').value   = b.codepostal     || ''
  document.getElementById('bvl-ville').value        = b.ville          || ''
  document.getElementById('bvl-urgence').value      = b.urgence_contact || ''
  document.getElementById('bvl-permis').checked     = b.permis || false

  document.getElementById('err-bvl-nom').style.display    = 'none'
  document.getElementById('err-bvl-prenom').style.display = 'none'

  openModal('modal-benevole')
}

function resetBvlForm () {
  ;['bvl-commentaires','bvl-nom','bvl-prenom','bvl-email','bvl-tel',
    'bvl-profession','bvl-adresse','bvl-codepostal','bvl-ville','bvl-urgence'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.value = ''
  })
  document.getElementById('bvl-permis').checked     = false
  document.getElementById('err-bvl-nom').style.display    = 'none'
  document.getElementById('err-bvl-prenom').style.display = 'none'
}

// ── Enregistrer (ajout ou modification) ──────────────────────────
async function saveBenévole () {
  const nom    = document.getElementById('bvl-nom').value.trim()
  const prenom = document.getElementById('bvl-prenom').value.trim()

  let valid = true
  if (!nom) {
    document.getElementById('err-bvl-nom').style.display = 'block'
    valid = false
  } else {
    document.getElementById('err-bvl-nom').style.display = 'none'
  }
  if (!prenom) {
    document.getElementById('err-bvl-prenom').style.display = 'block'
    valid = false
  } else {
    document.getElementById('err-bvl-prenom').style.display = 'none'
  }
  if (!valid) return

  const btn = document.getElementById('btn-save-bvl')
  btn.disabled = true
  btn.textContent = 'Enregistrement…'

  const payload = {
    commentaires:     document.getElementById('bvl-commentaires').value.trim(),
    nom,
    prenom,
    email:           document.getElementById('bvl-email').value.trim(),
    tel:             document.getElementById('bvl-tel').value.trim(),
    permis:          document.getElementById('bvl-permis').checked,
    profession:      document.getElementById('bvl-profession').value.trim(),
    adresse:         document.getElementById('bvl-adresse').value.trim(),
    codepostal:      document.getElementById('bvl-codepostal').value.trim(),
    ville:           document.getElementById('bvl-ville').value.trim(),
    urgence_contact: document.getElementById('bvl-urgence').value.trim(),
  }

  let error
  if (editingId) {
    // Modification
    const res = await db.from('volunteers').update(payload).eq('id', editingId)
    error = res.error
  } else {
    // Ajout
    payload.rgpd = true
    const res = await db.from('volunteers').insert(payload)
    error = res.error
  }

  btn.disabled = false
  btn.innerHTML = '<i class="fas fa-save" aria-hidden="true"></i> Enregistrer'

  if (error) {
    showToast('red', 'Erreur lors de l\'enregistrement.')
    console.error(error)
    return
  }

  closeModal('modal-benevole')
  showToast('green', editingId ? 'Bénévole mis à jour.' : 'Bénévole ajouté.')
  await loadBenevoles()
}

// ── Suppression ───────────────────────────────────────────────────
function openDeleteModal (id, name) {
  if (activeMenu) { activeMenu.classList.remove('open'); activeMenu = null }
  pendingDeleteId = id
  document.getElementById('confirm-del-name').textContent = name
  openModal('modal-confirm-delete')
}

async function confirmDelete () {
  if (!pendingDeleteId) return

  // Supprime d'abord les inscriptions liées
  await db.from('registrations').delete().eq('volunteers_id', pendingDeleteId)
  // Puis le bénévole
  const { error } = await db.from('volunteers').delete().eq('id', pendingDeleteId)

  closeModal('modal-confirm-delete')
  pendingDeleteId = null

  if (error) {
    showToast('red', 'Erreur lors de la suppression.')
    return
  }

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

function truncate (s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}
