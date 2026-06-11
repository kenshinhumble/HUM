export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.FREEMODEL_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FREEMODEL_API_KEY belum diset di Vercel.' })

  const { messages, model = 'gpt-5.4-mini', systemPrompt } = req.body

  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages

  try {
    const upstream = await fetch('https://api.freemodel.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages: allMessages, max_tokens: 2048 }),
    })

    if (!upstream.ok) {
      const err = await upstream.text()
      return res.status(upstream.status).json({ error: err })
    }

    const data = await upstream.json()
    const content = data.choices?.[0]?.message?.content || ''
    return res.status(200).json({ content })

  } catch (err) {
    return res.status(502).json({ error: err.message })
  }
}
