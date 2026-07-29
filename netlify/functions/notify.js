const fetch = require('node-fetch')

exports.handler = async (event) => {
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

  return {
    statusCode: res.ok ? 200 : 500,
    body: JSON.stringify({ ok: res.ok })
  }
}