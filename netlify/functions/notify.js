exports.handler = async (event) => {
  console.log('notify appelé, method:', event.httpMethod)
  console.log('body reçu:', event.body)

  try {
    if (!event.body) {
      return { statusCode: 400, body: 'Body manquant' }
    }

    const { registration_id } = JSON.parse(event.body)
    console.log('registration_id:', registration_id)

    if (!registration_id) {
      return { statusCode: 400, body: 'registration_id manquant' }
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseAnon = process.env.SUPABASE_ANON
    console.log('SUPABASE_URL défini:', !!supabaseUrl)
    console.log('SUPABASE_ANON défini:', !!supabaseAnon)

    const targetUrl = `${supabaseUrl}/functions/v1/notify-admin`
    console.log('URL appelée:', targetUrl)

    const res = await fetch(
      `${supabaseUrl}/functions/v1/notify-admin`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`
        },
        body: JSON.stringify({ registration_id })
      }
    )

    console.log('SERVICE_ROLE défini:', !!process.env.SUPABASE_SERVICE_ROLE) 

    const data = await res.text()
    console.log('Réponse Supabase:', res.status, data)

    return {
      statusCode: res.ok ? 200 : 500,
      body: data
    }
  } catch (e) {
    console.log('Erreur:', e.message)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    }
  }
}