export const config = { runtime: 'edge' }

const DAILY_MESSAGE_LIMIT = 30 // batas pesan per user per hari

// ─── Verify Supabase JWT (HS256) tanpa library tambahan ────────
async function verifyJWT(token, secret) {
  try {
    const [headerB64, payloadB64, sigB64] = token.split('.')
    if (!headerB64 || !payloadB64 || !sigB64) return null

    const data = `${headerB64}.${payloadB64}`
    const sig = base64UrlToBytes(sigB64)

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(data))
    if (!valid) return null

    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null

    return payload // { sub: userId, email, ... }
  } catch {
    return null
  }
}

function base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

// ─── Usage limit check + increment via Supabase REST (PostgREST) ─
async function checkAndIncrementUsage(userId) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const today = new Date().toISOString().split('T')[0]

  const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }

  // 1. Ambil count hari ini
  const getRes = await fetch(
    `${SUPABASE_URL}/rest/v1/usage_limits?user_id=eq.${userId}&date=eq.${today}&select=message_count`,
    { headers }
  )
  const rows = await getRes.json()
  const current = rows?.[0]?.message_count || 0

  if (current >= DAILY_MESSAGE_LIMIT) {
    return { allowed: false, remaining: 0 }
  }

  // 2. Upsert increment
  await fetch(`${SUPABASE_URL}/rest/v1/usage_limits?on_conflict=user_id,date`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: userId, date: today, message_count: current + 1 }),
  })

  return { allowed: true, remaining: DAILY_MESSAGE_LIMIT - (current + 1) }
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

  const jwtSecret = process.env.SUPABASE_JWT_SECRET
  const payload = await verifyJWT(token, jwtSecret)

  if (!payload)
    return new Response(JSON.stringify({ error: 'Sesi login tidak valid atau sudah habis. Silakan login ulang.' }), { status: 401 })

  const userId = payload.sub

  // ─── 2. Cek & catat kuota harian ───
  let usage
  try {
    usage = await checkAndIncrementUsage(userId)
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Gagal memeriksa kuota: ' + e.message }), { status: 500 })
  }

  if (!usage.allowed) {
    return new Response(JSON.stringify({
      error: `Kuota harian kamu (${DAILY_MESSAGE_LIMIT} pesan) sudah habis. Coba lagi besok ya 🙏`
    }), { status: 429 })
  }

  // ─── 3. Proxy ke FreeModel API ───
  const apiKey = process.env.FREEMODEL_API_KEY
  if (!apiKey)
    return new Response(JSON.stringify({ error: 'FREEMODEL_API_KEY belum diset.' }), { status: 500 })

  const { messages, model = 'gpt-5.4-mini', systemPrompt } = await req.json()

  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages

  const upstream = await fetch('https://api.freemodel.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages: allMessages, stream: true, max_tokens: 2048 }),
  })

  if (!upstream.ok) {
    const err = await upstream.text()
    return new Response(JSON.stringify({ error: err }), { status: upstream.status })
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'X-RateLimit-Remaining': String(usage.remaining),
    }
  })
}
