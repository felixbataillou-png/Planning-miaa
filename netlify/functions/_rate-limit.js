// Rate-limit partagé pour les fonctions serverless publiques, basé sur une
// table Supabase (rate_limit_log) interrogée via service_role. Pas de
// dépendance externe supplémentaire (Redis, etc.).

function getClientIp(event) {
  return (
    event.headers['x-nf-client-connection-ip'] ||
    (event.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    'unknown'
  )
}

/**
 * @param {string} bucket        - identifiant de la fonction ('register', 'lookup-volunteer'...)
 * @param {object} event         - event Netlify Function (pour extraire l'IP)
 * @param {number} maxRequests   - nombre de requêtes autorisées
 * @param {number} windowMinutes - fenêtre glissante en minutes
 * @returns {Promise<boolean>} true si la requête est autorisée
 */
async function checkRateLimit(bucket, event, maxRequests, windowMinutes) {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE
  const headers = {
    'Content-Type': 'application/json',
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`
  }

  const key   = `${bucket}:${getClientIp(event)}`
  const since = new Date(Date.now() - windowMinutes * 60000).toISOString()

  const countRes = await fetch(
    `${supabaseUrl}/rest/v1/rate_limit_log?select=id&key=eq.${encodeURIComponent(key)}&created_at=gte.${since}`,
    { headers: { ...headers, Prefer: 'count=exact' } }
  )
  const contentRange = countRes.headers.get('content-range') || '0-0/0'
  const total = parseInt(contentRange.split('/')[1] || '0', 10)

  if (total >= maxRequests) return false

  // Fire-and-forget : n'attend pas la fin de l'insertion pour ne pas ralentir la requête
  fetch(`${supabaseUrl}/rest/v1/rate_limit_log`, {
    method: 'POST', headers, body: JSON.stringify({ key })
  }).catch(() => {})

  return true
}

module.exports = { checkRateLimit }
