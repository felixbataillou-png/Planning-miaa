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
