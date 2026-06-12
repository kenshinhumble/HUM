export const config = { runtime: 'edge' }

function fetchWithTimeout(url, options = {}, ms = 6000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer))
}

// ─── Verifikasi token via Supabase Auth API ────────────────────
async function getUserFromToken(token) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const ANON_KEY = process.env.SUPABASE_ANON_KEY

  const res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': ANON_KEY,
    }
  }, 6000)

  if (!res.ok) return null
  const user = await res.json()
  return user?.id ? user : null
}

// ─── Main handler ────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
  }

  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })

  // ─── DEBUG: cek env vars dulu ───
  const missingEnv = []
  if (!process.env.SUPABASE_URL) missingEnv.push('SUPABASE_URL')
  if (!process.env.SUPABASE_ANON_KEY) missingEnv.push('SUPABASE_ANON_KEY')
  if (!process.env.FREEMODEL_API_KEY) missingEnv.push('FREEMODEL_API_KEY')

  if (missingEnv.length) {
    return new Response(JSON.stringify({
      error: `Env var belum diset di Vercel: ${missingEnv.join(', ')}`
    }), { status: 500 })
  }

  // ─── 1. Verifikasi login ───
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')

  if (!token)
    return new Response(JSON.stringify({ error: 'Belum login. Silakan login terlebih dahulu.' }), { status: 401 })

  let user
  try {
    user = await getUserFromToken(token)
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Gagal verifikasi ke Supabase: ' + e.message }), { status: 500 })
  }

  if (!user)
    return new Response(JSON.stringify({ error: 'Sesi login tidak valid atau sudah habis. Silakan login ulang.' }), { status: 401 })

  // ─── 2. Proxy ke FreeModel API (rate limit dimatikan sementara) ───
  const apiKey = process.env.FREEMODEL_API_KEY

  const { messages, model = 'gpt-5.4-mini', systemPrompt } = await req.json()

  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages

  let upstream
  try {
    upstream = await fetchWithTimeout('https://api.freemodel.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages: allMessages, stream: true, max_tokens: 2048 }),
    }, 20000)
  } catch (e) {
    return new Response(JSON.stringify({ error: 'FreeModel API timeout: ' + e.message }), { status: 504 })
  }

  if (!upstream.ok) {
    const err = await upstream.text()
    return new Response(JSON.stringify({ error: `FreeModel error (${upstream.status}): ${err}` }), { status: upstream.status })
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    }
  })
}
