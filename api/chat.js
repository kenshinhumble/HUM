export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }

  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })

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

  // Langsung forward SSE stream dari freemodel ke browser
  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    }
  })
}
