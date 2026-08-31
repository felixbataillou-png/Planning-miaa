const crypto = require('crypto')
const { checkRateLimit } = require('./_rate-limit')

// Regroupe tout le flux d'inscription publique côté serveur (clé service_role) :
// find-or-create du bénévole, anti-doublon sur le créneau, insertion de
// l'inscription, notification admin. Nécessaire depuis le verrouillage RLS :
// un anonyme ne peut plus lire volunteers/registrations, donc ne peut plus
// faire ces étapes lui-même depuis le navigateur avec la clé anon.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  try {
    if (!event.body) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Body manquant' }) }
    }

    const {
      date, role, nom, prenom, email, tel, permis,
      secu = '', profession = '', adresse = '', codepostal = '',
      ville = '', urgenceContact = '', firstTime = false, website = ''
    } = JSON.parse(event.body)

    // Piège à bots : un champ censé rester vide, invisible pour un humain.
    // On répond succès sans rien écrire, pour ne pas révéler le mécanisme.
    if (website) {
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    if (!date || !role || !nom || !email || !tel) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Champs requis manquants' }) }
    }

    // Rôles accessibles au formulaire public uniquement — le rôle "cdm" est
    // réservé aux ajouts manuels depuis planning-admin (voir js/planning-admin.js)
    if (!['cuisinier', 'maraudeur'].includes(role)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Rôle invalide' }) }
    }

    const allowed = await checkRateLimit('register', event, 5, 10)
    if (!allowed) {
      return { statusCode: 429, body: JSON.stringify({ error: 'Trop de tentatives, merci de réessayer plus tard.' }) }
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE
    const headers = {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`
    }

    // 1. Recherche ou création du bénévole
    const findRes  = await fetch(
      `${supabaseUrl}/rest/v1/volunteers?select=id&email=eq.${encodeURIComponent(email)}`,
      { headers }
    )
    const findData = await findRes.json()

    let volunteerId = Array.isArray(findData) && findData.length > 0 ? findData[0].id : null
    const isNewVolunteer = !volunteerId

    if (!volunteerId) {
      const createRes = await fetch(`${supabaseUrl}/rest/v1/volunteers`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          nom, prenom, email, tel, permis, secu, profession, adresse,
          codepostal, ville, urgence_contact: urgenceContact, rgpd: true
        })
      })
      const created = await createRes.json()
      if (!createRes.ok || !created[0]) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Erreur création bénévole' }) }
      }
      volunteerId = created[0].id
    }

    // 2. Vérification anti-doublon sur ce créneau
    const dupRes = await fetch(
      `${supabaseUrl}/rest/v1/registrations?select=id&volunteers_id=eq.${volunteerId}&date=eq.${date}&role=eq.${role}`,
      { headers }
    )
    const dupData = await dupRes.json()
    if (Array.isArray(dupData) && dupData.length > 0) {
      return { statusCode: 409, body: JSON.stringify({ error: 'DEJA_INSCRIT' }) }
    }

    // 3. Création de l'inscription avec un token unique (utilisé pour la validation admin)
    const token  = crypto.randomUUID()
    const regRes = await fetch(`${supabaseUrl}/rest/v1/registrations`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        volunteers_id: volunteerId, date, role, status: 'pending', Confirm_token: token,
        first_time: !!firstTime, new_volunteer: isNewVolunteer
      })
    })
    const regData = await regRes.json()
    if (!regRes.ok || !regData[0]) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Erreur création inscription' }) }
    }

    // 4. Notification email aux admins
    const notifyRes = await fetch(`${supabaseUrl}/functions/v1/Notify_admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ registration_id: regData[0].id })
    })

    if (!notifyRes.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'NOTIFY_FAILED' }) }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
