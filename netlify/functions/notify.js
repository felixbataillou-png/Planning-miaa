exports.handler = async (event) => {
  try {
    const { registration_id } = JSON.parse(event.body)

    const res = await fetch(
      `${process.env.SUPABASE_URL}/functions/v1/notify-admin`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_ANON}`
        },
        body: JSON.stringify({ registration_id })
      }
    )

    const data = await res.text()
    return {
      statusCode: res.ok ? 200 : 500,
      body: data
    }
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    }
  }
}