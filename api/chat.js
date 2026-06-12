export const config = { runtime: 'edge' }

const DAILY_MESSAGE_LIMIT = 30 // batas pesan per user per hari
const FETCH_TIMEOUT_MS = 8000 // timeout untuk request ke Supabase

function fetchWithTimeout(url, options = {}, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer))
}

// ─── Verifikasi token via Supabase Auth API ────────────────────
async function getUserFromToken(token) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const ANON_KEY = process.env.SUPABASE_ANON_KEY

  try {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': ANON_KEY,
      }
    })
    if (!res.ok) return null
    const user = await res.json()
    return user?.id ? user : null
  } catch {
    return null // timeout / network error → treat as unauthenticated
  }
}

// ─── Cek kuota harian (read-only, cepat) ───────────────────────
async function checkUsage(userId) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const today = new Date().toISOString().split('T')[0]

  const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
  }

  try {
    const res = await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/usage_limits?user_id=eq.${userId}&date=eq.${today}&select=message_count`,
      { headers }
    )
    if (!res.ok) return { current: 0, today } // gagal cek → izinkan, jangan blok user
    const rows = await res.json()
    return { current: rows?.[0]?.message_count || 0, today }
  } catch {
    return { current: 0, today } // timeout → izinkan, jangan blok user
  }
}

// ─── Increment kuota — fire & forget, tidak menunggu hasil ─────
function incrementUsage(userId, today, newCount) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  fetchWithTimeout(`${SUPABASE_URL}/rest/v1/usage_limits?on_conflict=user_id,date`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ user_id: userId, date: today, message_count: newCount }),
  }, 5000).catch(() => { /* abaikan kalau gagal, tidak kritikal */ })
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

  // ─── 1. Verifikasi login ───
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')

  if (!token)
    return new Response(JSON.stringify({ error: 'Belum login. Silakan login terlebih dahulu.' }), { status: 401 })

  const user = await getUserFromToken(token)

  if (!user)
    return new Response(JSON.stringify({ error: 'Sesi login tidak valid atau sudah habis. Silakan login ulang.' }), { status: 401 })

  const userId = user.id

  // ─── 2. Cek kuota harian (read-only, fail-open kalau Supabase lambat) ───
  const { current, today } = await checkUsage(userId)

  if (current >= DAILY_MESSAGE_LIMIT) {
    return new Response(JSON.stringify({
      error: `Kuota harian kamu (${DAILY_MESSAGE_LIMIT} pesan) sudah habis. Coba lagi besok ya 🙏`
    }), { status: 429 })
  }

  // Catat pemakaian di background, TIDAK menunggu hasilnya
  incrementUsage(userId, today, current + 1)

  // ─── 3. Proxy ke FreeModel API ───
  const apiKey = process.env.FREEMODEL_API_KEY
  if (!apiKey)
    return new Response(JSON.stringify({ error: 'FREEMODEL_API_KEY belum diset.' }), { status: 500 })

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
    return new Response(JSON.stringify({ error: 'FreeModel API tidak merespons (timeout). Coba lagi.' }), { status: 504 })
  }

  if (!upstream.ok) {
    const err = await upstream.text()
    return new Response(JSON.stringify({ error: err }), { status: upstream.status })
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'X-RateLimit-Remaining': String(DAILY_MESSAGE_LIMIT - (current + 1)),
    }
  })
}
