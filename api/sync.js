export const config = { runtime: 'edge' }

const ALLOWED_ORIGINS = [
  'https://hum-self.vercel.app',
  'http://localhost:3000',
  'http://localhost:8000',
]
if (process.env.ALLOWED_ORIGIN) ALLOWED_ORIGINS.push(process.env.ALLOWED_ORIGIN)

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  }
}

async function getUserFromToken(token) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const ANON_KEY = process.env.SUPABASE_ANON_KEY
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': ANON_KEY },
  })
  if (!res.ok) return null
  const user = await res.json()
  return user?.id ? user : null
}

// Turso helper
async function tursoQuery(sql, args = []) {
  const url = process.env.TURSO_URL
  const token = process.env.TURSO_AUTH_TOKEN
  const res = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{ type: 'execute', stmt: { sql, args } }],
    }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Turso ${res.status}: ${txt}`)
  }
  const data = await res.json()
  // Turso v2 pipeline response shape
  const result = data?.results?.[0]?.response?.result
  return { cols: result?.cols ?? [], rows: result?.rows ?? [] }
}

function rowToObj(row, cols) {
  const obj = {}
  cols.forEach((c, i) => {
    const val = row[i]
    obj[c.name] = val?.type === 'integer' || val?.type === 'null' ? val?.value : val?.value
  })
  return obj
}

export default async function handler(req) {
  const origin = req.headers.get('origin') || ''
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(origin) })
  }

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    })
  }

  const user = await getUserFromToken(token)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    })
  }

  const path = new URL(req.url).pathname

  try {
    // ─── GET /api/sync?list=1 ─── list conversations
    if (req.method === 'GET' && path.endsWith('/api/sync')) {
      const list = new URL(req.url).searchParams.get('list')
      if (list === '1') {
        const rows = await tursoQuery(
          `SELECT id, title, model, system_prompt, created_at, updated_at
           FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`,
          [{ type: 'text', value: user.id }]
        )
        // Turso pipeline returns cols + rows
        const cols = rows?.cols ?? []
        const data = (rows?.rows ?? []).map(r => rowToObj(r, cols))
        return new Response(JSON.stringify({ conversations: data }), {
          headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        })
      }
      // GET /api/sync?conv=ID
      const convId = new URL(req.url).searchParams.get('conv')
      if (convId) {
        const rows = await tursoQuery(
          `SELECT role, content, created_at FROM messages
           WHERE conversation_id = ? ORDER BY created_at ASC`,
          [{ type: 'text', value: convId }]
        )
        const cols = rows?.cols ?? []
        const data = (rows?.rows ?? []).map(r => rowToObj(r, cols))
        return new Response(JSON.stringify({ messages: data }), {
          headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: 'Missing param' }), {
        status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      })
    }

    // ─── POST /api/sync ─── upsert conversation + messages
    if (req.method === 'POST' && path.endsWith('/api/sync')) {
      const body = await req.json()
      const { conversation, messages } = body

      if (!conversation?.id) {
        return new Response(JSON.stringify({ error: 'Missing conversation.id' }), {
          status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        })
      }

      const now = Date.now()
      // Upsert conversation
      await tursoQuery(
        `INSERT INTO conversations (id, user_id, title, model, system_prompt, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           model = excluded.model,
           system_prompt = excluded.system_prompt,
           updated_at = excluded.updated_at`,
        [
          { type: 'text', value: conversation.id },
          { type: 'text', value: user.id },
          { type: 'text', value: conversation.title || 'New Chat' },
          { type: 'text', value: conversation.model || 'gpt-5.4-mini' },
          { type: 'text', value: conversation.system_prompt || '' },
          { type: 'integer', value: String(conversation.created_at || now) },
          { type: 'integer', value: String(now) },
        ]
      )

      // Insert messages (simple: delete old, insert new — atau append only)
      // Untuk simplicity: delete all then insert (safe untuk sync penuh)
      await tursoQuery(
        `DELETE FROM messages WHERE conversation_id = ?`,
        [{ type: 'text', value: conversation.id }]
      )
      for (const msg of (messages || [])) {
        await tursoQuery(
          `INSERT INTO messages (conversation_id, role, content, created_at)
           VALUES (?, ?, ?, ?)`,
          [
            { type: 'text', value: conversation.id },
            { type: 'text', value: msg.role },
            { type: 'text', value: msg.content },
            { type: 'integer', value: String(msg.created_at || now) },
          ]
        )
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      })
    }

    // ─── DELETE /api/sync?conv=ID ─── hapus thread
    if (req.method === 'DELETE' && path.endsWith('/api/sync')) {
      const convId = new URL(req.url).searchParams.get('conv')
      if (!convId) {
        return new Response(JSON.stringify({ error: 'Missing conv id' }), {
          status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        })
      }
      await tursoQuery(
        `DELETE FROM conversations WHERE id = ? AND user_id = ?`,
        [
          { type: 'text', value: convId },
          { type: 'text', value: user.id },
        ]
      )
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    })
  }
}
