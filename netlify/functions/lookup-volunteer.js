const { checkRateLimit } = require('./_rate-limit')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  try {
    if (!event.body) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Body manquant' }) }
    }

    const { email } = JSON.parse(event.body)
    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'email manquant' }) }
    }

    // Cette fonction est un oracle d'énumération par nature (existe/n'existe
    // pas + nom/tel) : limite plus stricte que register pour freiner le scan
    // d'adresses email.
    const allowed = await checkRateLimit('lookup-volunteer', event, 10, 5)
    if (!allowed) {
      return { statusCode: 429, body: JSON.stringify({ error: 'Trop de requêtes, merci de réessayer plus tard.' }) }
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE

    const res = await fetch(
      `${supabaseUrl}/rest/v1/volunteers?select=id,nom,prenom,tel,permis&email=eq.${encodeURIComponent(email)}`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    )
    const data = await res.json()

    if (Array.isArray(data) && data.length > 0) {
      const { id, nom, prenom, tel, permis } = data[0]
      return { statusCode: 200, body: JSON.stringify({ exists: true, id, nom, prenom, tel, permis }) }
    }
    return { statusCode: 200, body: JSON.stringify({ exists: false }) }
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
