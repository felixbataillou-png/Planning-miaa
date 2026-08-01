/**
 * benevoles-admin.js
 * Logique de la page gestion des bénévoles.
 */

window.ADMIN_PAGE = 'benevoles'

const PAGE_SIZE = 30
let allBenevoles    = []
let filteredList    = []
let currentPage     = 1
let editingId       = null
let pendingDeleteId = null

// ── Point d'entrée ───────────────────────────────────────────────
window.onAdminReady = async function () {
  initFloatingMenu()
  initColumnResize()
  await loadBenevoles()
}

// ── Chargement ───────────────────────────────────────────────────
async function loadBenevoles () {
  const { data, error } = await db
    .from('volunteers')
    .select('id, commentaires, nom, prenom, email, tel, permis, secu, profession, adresse, codepostal, ville, urgence_contact, rgpd')
    .order('nom', { ascending: true })

  if (error) {
    console.error(error)
    document.getElementById('benevoles-tbody').innerHTML =
      `<tr><td colspan="12" class="table-empty">Erreur de chargement : ${error.message}</td></tr>`
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

// ── Rendu tableau ─────────────────────────────────────────────────
function renderTable () {
  const total = filteredList.length
  const start = (currentPage - 1) * PAGE_SIZE
  const page  = filteredList.slice(start, Math.min(start + PAGE_SIZE, total))
  
  const tbody = document.getElementById('benevoles-tbody')
  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" class="table-empty">Aucun bénévole trouvé.</td></tr>`
    renderPagination(total); return
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
      <td class="td-actions">
        <button class="btn-actions"
                aria-label="Actions pour ${esc(b.prenom)} ${esc(b.nom)}"
                aria-haspopup="true" aria-expanded="false"
                data-id="${b.id}"
                onclick="toggleMenu(event,'${b.id}')">
          <i class="fas fa-ellipsis-v" aria-hidden="true"></i>
        </button>
      </td>
    </tr>
  `).join('')
  renderPagination(total)
}

// ── Menu 3 points flottant ────────────────────────────────────────
let activeMenuId = null
let menuEl       = null

function initFloatingMenu () {
  if (document.getElementById('floating-bvl-menu')) return
  const div = document.createElement('div')
  div.id        = 'floating-bvl-menu'
  div.className = 'actions-menu'
  div.setAttribute('role', 'menu')
  div.innerHTML = `
    <button role="menuitem" onclick="openEditModal()">
      <i class="fas fa-pen" aria-hidden="true"></i> Modifier
    </button>
    <hr>
    <button class="danger" role="menuitem" onclick="openDeleteModal()">
      <i class="fas fa-trash" aria-hidden="true"></i> Supprimer
    </button>`
  document.body.appendChild(div)
  menuEl = div
}

function getBenevoleById (id) { return allBenevoles.find(v => v.id === id) }

function toggleMenu (e, id) {
  e.stopPropagation()
  const btn    = e.currentTarget
  const isOpen = activeMenuId === id && menuEl.classList.contains('open')
  closeFloatingMenu()
  if (!isOpen) {
    activeMenuId = id
    const rect = btn.getBoundingClientRect()
    menuEl.style.top  = `${rect.bottom + 4 + window.scrollY}px`
    menuEl.style.left = `${Math.max(4, rect.right - 144)}px`
    menuEl.style.position = 'absolute'
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

// ── Pagination ─────────────────────────────────────────────────────
function renderPagination (total) {
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const pag = document.getElementById('pagination')
  if (totalPages <= 1) { pag.innerHTML = ''; return }
  let html = `<button onclick="goToPage(${currentPage - 1})" ${currentPage===1?'disabled':''} aria-label="Page précédente">‹</button>`
  for (let i = 1; i <= totalPages; i++) {
    if (i===1||i===totalPages||Math.abs(i-currentPage)<=2) {
      html += `<button onclick="goToPage(${i})" class="${i===currentPage?'active':''}"
               aria-label="Page ${i}" ${i===currentPage?'aria-current="page"':''}>${i}</button>`
    } else if (Math.abs(i-currentPage)===3) {
      html += `<span style="padding:0 4px;color:#999">…</span>`
    }
  }
  html += `<button onclick="goToPage(${currentPage+1})" ${currentPage===totalPages?'disabled':''} aria-label="Page suivante">›</button>`
  html += `<span class="pagination-info">${(currentPage-1)*PAGE_SIZE+1}–${Math.min(currentPage*PAGE_SIZE,total)} sur ${total}</span>`
  pag.innerHTML = html
}

function goToPage (page) {
  const totalPages = Math.ceil(filteredList.length / PAGE_SIZE)
  if (page < 1 || page > totalPages) return
  currentPage = page
  renderTable()
  document.getElementById('main-content').scrollIntoView({ behavior: 'smooth' })
}

// ── Redimensionnement des colonnes ────────────────────────────────
function initColumnResize () {
  const table = document.getElementById('benevoles-table')
  if (!table) return
  const cols   = table.querySelectorAll('col')
  const ths    = table.querySelectorAll('thead th')

  ths.forEach((th, i) => {
    if (i === ths.length - 1) return // pas de resize sur la colonne actions
    const resizer = document.createElement('span')
    resizer.className = 'col-resizer'
    resizer.setAttribute('aria-hidden', 'true')
    th.appendChild(resizer)

    let startX, startW

    resizer.addEventListener('mousedown', e => {
      startX = e.clientX
      startW = cols[i].getBoundingClientRect().width
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      function onMove (e) {
        const newW = Math.max(40, startW + e.clientX - startX)
        cols[i].style.width = `${newW}px`
      }
      function onUp () {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      e.preventDefault()
    })
  })
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
  if (e.key !== 'Escape') return
  ;['modal-add-bvl','modal-edit-bvl','modal-confirm-delete'].forEach(id => closeBvlModal(id))
})

// ── Modale Ajouter ────────────────────────────────────────────────
function openAddModal () {
  editingId = null
  resetAddForm()
  openBvlModal('modal-add-bvl')
  setTimeout(() => document.getElementById('add-bvl-nom').focus(), 120)
}

function resetAddForm () {
  ;['add-bvl-nom','add-bvl-prenom','add-bvl-email','add-bvl-tel','add-bvl-secu',
    'add-bvl-profession','add-bvl-adresse','add-bvl-codepostal','add-bvl-ville',
    'add-bvl-urgence','add-bvl-commentaires'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = ''
  })
  document.getElementById('add-bvl-permis').checked = false
  document.getElementById('add-bvl-rgpd').checked   = false
  ;['err-add-bvl-nom','err-add-bvl-prenom','err-add-bvl-email','err-add-bvl-secu'].forEach(id => {
    document.getElementById(id).style.display = 'none'
  })
}

async function saveNewBenévole () {
  const nom    = document.getElementById('add-bvl-nom').value.trim()
  const prenom = document.getElementById('add-bvl-prenom').value.trim()
  const email  = document.getElementById('add-bvl-email').value.trim()
  const secu   = document.getElementById('add-bvl-secu').value.trim()

  let valid = true
  const checks = [
    { ok: nom.length > 0,                            errId: 'err-add-bvl-nom' },
    { ok: prenom.length > 0,                         errId: 'err-add-bvl-prenom' },
    { ok: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), errId: 'err-add-bvl-email' },
    { ok: secu.length > 0,                           errId: 'err-add-bvl-secu' },
  ]
  checks.forEach(c => {
    document.getElementById(c.errId).style.display = c.ok ? 'none' : 'block'
    if (!c.ok) valid = false
  })
  if (!valid) return

  const btn = document.getElementById('btn-save-add-bvl')
  btn.disabled = true; btn.textContent = 'Ajout…'

  const { error } = await db.from('volunteers').insert({
    nom, prenom, email, secu,
    tel:             document.getElementById('add-bvl-tel').value.trim(),
    permis:          document.getElementById('add-bvl-permis').checked,
    rgpd:            document.getElementById('add-bvl-rgpd').checked,
    profession:      document.getElementById('add-bvl-profession').value.trim(),
    adresse:         document.getElementById('add-bvl-adresse').value.trim(),
    codepostal:      document.getElementById('add-bvl-codepostal').value.trim(),
    ville:           document.getElementById('add-bvl-ville').value.trim(),
    urgence_contact: document.getElementById('add-bvl-urgence').value.trim(),
    commentaires:    document.getElementById('add-bvl-commentaires').value.trim(),
  })

  btn.disabled = false
  btn.innerHTML = '<i class="fas fa-plus" aria-hidden="true"></i> Ajouter'

  if (error) { showToast('red', 'Erreur lors de l\'ajout.'); console.error(error); return }
  closeBvlModal('modal-add-bvl')
  showToast('green', 'Bénévole ajouté.')
  await loadBenevoles()
}

// ── Modale Modifier ───────────────────────────────────────────────
function openEditModal () {
  const id = activeMenuId
  closeFloatingMenu()
  const b = getBenevoleById(activeMenuId || editingId)
  if (!b) return
  editingId = b.id

  document.getElementById('edit-bvl-sub').textContent      = `${b.prenom || ''} ${b.nom || ''}`.trim()
  document.getElementById('edit-bvl-nom').value            = b.nom             || ''
  document.getElementById('edit-bvl-prenom').value         = b.prenom          || ''
  document.getElementById('edit-bvl-email').value          = b.email           || ''
  document.getElementById('edit-bvl-tel').value            = b.tel             || ''
  document.getElementById('edit-bvl-profession').value     = b.profession      || ''
  document.getElementById('edit-bvl-adresse').value        = b.adresse         || ''
  document.getElementById('edit-bvl-codepostal').value     = b.codepostal      || ''
  document.getElementById('edit-bvl-ville').value          = b.ville           || ''
  document.getElementById('edit-bvl-urgence').value        = b.urgence_contact || ''
  document.getElementById('edit-bvl-commentaires').value   = b.commentaires    || ''
  document.getElementById('edit-bvl-permis').checked       = b.permis          || false

  ;['err-edit-bvl-nom','err-edit-bvl-prenom'].forEach(id => {
    document.getElementById(id).style.display = 'none'
  })
  openBvlModal('modal-edit-bvl')
}

async function saveEditBenévole () {
  const nom    = document.getElementById('edit-bvl-nom').value.trim()
  const prenom = document.getElementById('edit-bvl-prenom').value.trim()

  let valid = true
  if (!nom)    { document.getElementById('err-edit-bvl-nom').style.display    = 'block'; valid = false }
  else           document.getElementById('err-edit-bvl-nom').style.display    = 'none'
  if (!prenom) { document.getElementById('err-edit-bvl-prenom').style.display = 'block'; valid = false }
  else           document.getElementById('err-edit-bvl-prenom').style.display = 'none'
  if (!valid) return

  const btn = document.getElementById('btn-save-edit-bvl')
  btn.disabled = true; btn.textContent = 'Enregistrement…'

  const { error } = await db.from('volunteers').update({
    nom, prenom,
    email:           document.getElementById('edit-bvl-email').value.trim(),
    tel:             document.getElementById('edit-bvl-tel').value.trim(),
    permis:          document.getElementById('edit-bvl-permis').checked,
    profession:      document.getElementById('edit-bvl-profession').value.trim(),
    adresse:         document.getElementById('edit-bvl-adresse').value.trim(),
    codepostal:      document.getElementById('edit-bvl-codepostal').value.trim(),
    ville:           document.getElementById('edit-bvl-ville').value.trim(),
    urgence_contact: document.getElementById('edit-bvl-urgence').value.trim(),
    commentaires:    document.getElementById('edit-bvl-commentaires').value.trim(),
  }).eq('id', editingId)

  btn.disabled = false
  btn.innerHTML = '<i class="fas fa-save" aria-hidden="true"></i> Enregistrer'

  if (error) { showToast('red', 'Erreur lors de la modification.'); console.error(error); return }
  closeBvlModal('modal-edit-bvl')
  showToast('green', 'Bénévole mis à jour.')
  await loadBenevoles()
}

// ── Modale Supprimer ──────────────────────────────────────────────
function openDeleteModal () {
  const id = activeMenuId
  closeFloatingMenu()
  const b = getBenevoleById(activeMenuId || pendingDeleteId)
  if (!b) return
  pendingDeleteId = b.id

  const nom = `${b.prenom || ''} ${b.nom || ''}`.trim()
  document.getElementById('confirm-del-sub').textContent = nom
  document.getElementById('confirm-del-info').innerHTML = `
    <div class="pib-row"><i class="fas fa-user" aria-hidden="true"></i><strong>${esc(nom)}</strong></div>
    ${b.tel   ? `<div class="pib-row"><i class="fas fa-phone" aria-hidden="true"></i>${esc(b.tel)}</div>` : ''}
    ${b.email ? `<div class="pib-row"><i class="fas fa-envelope" aria-hidden="true"></i>${esc(b.email)}</div>` : ''}
  `
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
  const el = document.getElementById('toast')
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
