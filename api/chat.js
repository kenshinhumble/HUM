export const config = { runtime: 'edge' }

// ─── Konfigurasi ────────────────────────────────────────────
// Tambahkan domain lain di sini kalau kamu punya custom domain.
const ALLOWED_ORIGINS = [
  'https://hum-self.vercel.app',
  'http://localhost:3000',
  'http://localhost:8000',
]
// Bisa override / tambah lewat env var ALLOWED_ORIGIN (opsional)
if (process.env.ALLOWED_ORIGIN) ALLOWED_ORIGINS.push(process.env.ALLOWED_ORIGIN)

const FALLBACK_MODEL = 'gpt-5.4-mini' // model tercepat, dipakai kalau model utama 504/timeout
const PING_INTERVAL_MS = 5000         // keep-alive ping setiap 5 detik (SSE comment, diabaikan client)
const RATE_LIMIT_MAX = 10             // max request
const RATE_LIMIT_WINDOW_MS = 60_000   // per 60 detik, per user

// ─── Rate limit store (in-memory, per edge instance) ─────────
// CATATAN: Edge Functions bisa jalan di banyak instance berbeda,
// jadi limit ini "best-effort" — tidak 100% akurat lintas region,
// tapi cukup untuk mencegah spam kasar dari 1 user. Untuk akurasi
// penuh lintas instance, perlu Vercel KV / Upstash Redis (opsional,
// bisa ditambah belakangan).
const rateLimitMap = new Map()

function checkRateLimit(userId) {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)

  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, start: now })
    return { ok: true }
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfter: Math.ceil((entry.start + RATE_LIMIT_WINDOW_MS - now) / 1000) }
  }
  entry.count++
  return { ok: true }
}

// Bersihkan entry lama biar Map tidak bocor memori
function cleanupRateLimit() {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.start > RATE_LIMIT_WINDOW_MS) rateLimitMap.delete(key)
  }
}

// ─── CORS helper ──────────────────────────────────────────────
function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  }
}

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

// ─── Panggil FreeModel, auto fallback ke model cepat kalau 504/timeout ───
async function callFreeModel(apiKey, model, allMessages, isRetry = false) {
  try {
    const res = await fetchWithTimeout('https://api.freemodel.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages: allMessages, stream: true, max_tokens: 2048 }),
    }, 45000)

    // Kalau upstream balas 504 dan kita belum coba fallback, coba lagi dengan model cepat
    if (res.status === 504 && !isRetry && model !== FALLBACK_MODEL) {
      return await callFreeModel(apiKey, FALLBACK_MODEL, allMessages, true)
    }
    return { res, usedModel: model }
  } catch (e) {
    // Timeout / network error → coba fallback sekali
    if (!isRetry && model !== FALLBACK_MODEL) {
      return await callFreeModel(apiKey, FALLBACK_MODEL, allMessages, true)
    }
    throw e
  }
}

// ─── Bungkus stream upstream dengan keep-alive ping ────────────
// Setiap PING_INTERVAL_MS, kirim baris komentar SSE (": ping\n\n").
// Baris ini diabaikan oleh parser SSE standar (tidak diawali "data:"),
// tapi cukup untuk mencegah koneksi dianggap idle/504 oleh proxy.
function streamWithKeepAlive(upstreamBody) {
  const encoder = new TextEncoder()
  const reader = upstreamBody.getReader()
  let pingTimer

  return new ReadableStream({
    start(controller) {
      pingTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'))
        } catch {
          clearInterval(pingTimer)
        }
      }, PING_INTERVAL_MS)

      function pump() {
        reader.read().then(({ done, value }) => {
          if (done) {
            clearInterval(pingTimer)
            try { controller.close() } catch {}
            return
          }
          try { controller.enqueue(value) } catch {}
          pump()
        }).catch(err => {
          clearInterval(pingTimer)
          try { controller.error(err) } catch {}
        })
      }
      pump()
    },
    cancel() {
      clearInterval(pingTimer)
      reader.cancel().catch(() => {})
    }
  })
}

// ─── Main handler ────────────────────────────────────────────
export default async function handler(req) {
  const origin = req.headers.get('origin') || ''

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(origin) })
  }

  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    })

  // ─── DEBUG: cek env vars dulu ───
  const missingEnv = []
  if (!process.env.SUPABASE_URL) missingEnv.push('SUPABASE_URL')
  if (!process.env.SUPABASE_ANON_KEY) missingEnv.push('SUPABASE_ANON_KEY')
  if (!process.env.FREEMODEL_API_KEY) missingEnv.push('FREEMODEL_API_KEY')

  if (missingEnv.length) {
    return new Response(JSON.stringify({
      error: `Env var belum diset di Vercel: ${missingEnv.join(', ')}`
    }), { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
  }

  // ─── 1. Verifikasi login ───
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')

  if (!token)
    return new Response(JSON.stringify({ error: 'Belum login. Silakan login terlebih dahulu.' }), {
      status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    })

  let user
  try {
    user = await getUserFromToken(token)
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Gagal verifikasi ke Supabase: ' + e.message }), {
      status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    })
  }

  if (!user)
    return new Response(JSON.stringify({ error: 'Sesi login tidak valid atau sudah habis. Silakan login ulang.' }), {
      status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    })

  // ─── 2. Rate limiting (10 req/menit per user) ───
  cleanupRateLimit()
  const rl = checkRateLimit(user.id)
  if (!rl.ok) {
    return new Response(JSON.stringify({
      error: `Terlalu banyak permintaan. Coba lagi dalam ${rl.retryAfter} detik.`
    }), {
      status: 429,
      headers: {
        ...corsHeaders(origin),
        'Content-Type': 'application/json',
        'Retry-After': String(rl.retryAfter),
      }
    })
  }

  // ─── 3. Proxy ke FreeModel API (dengan fallback model) ───
  const apiKey = process.env.FREEMODEL_API_KEY
  const { messages, model = 'gpt-5.4-mini', systemPrompt } = await req.json()

  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages

  let upstream, usedModel
  try {
    const result = await callFreeModel(apiKey, model, allMessages)
    upstream = result.res
    usedModel = result.usedModel
  } catch (e) {
    return new Response(JSON.stringify({ error: 'FreeModel API timeout: ' + e.message }), {
      status: 504, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    })
  }

  if (!upstream.ok) {
    const err = await upstream.text()
    return new Response(JSON.stringify({ error: `FreeModel error (${upstream.status}): ${err}` }), {
      status: upstream.status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    })
  }

  // ─── 4. Stream balik ke client, dengan keep-alive ping ───
  return new Response(streamWithKeepAlive(upstream.body), {
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      // Header ini bisa dibaca client kalau mau menampilkan
      // "switched to faster model" saat fallback terjadi.
      'X-Model-Used': usedModel,
    }
  })
}
