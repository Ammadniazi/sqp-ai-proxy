/**
 * SQP AI Proxy — Vercel Serverless Function
 * ------------------------------------------
 * Sits between your dashboard and OpenRouter.
 * The OPENROUTER_API_KEY env var is set in Vercel's dashboard,
 * so it is never visible to end users.
 *
 * Endpoint:  POST /api/insight
 * Body:      { prompt: string }
 * Returns:   { text: string } | { error: string }
 */

export default async function handler(req, res) {
  /* ── CORS — allow your GitHub Pages domain (and localhost for dev) ── */
  const allowed = [
    'https://ammadniazi.github.io',
    'http://localhost',
    'http://127.0.0.1',
  ];
  const origin = req.headers.origin || '';
  if (allowed.some(o => origin.startsWith(o))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  /* Preflight */
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* Only accept POST */
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* Validate body */
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 10) {
    return res.status(400).json({ error: 'Missing or invalid prompt' });
  }
  if (prompt.length > 8000) {
    return res.status(400).json({ error: 'Prompt too long (max 8000 chars)' });
  }

  /* API key lives only on the server */
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server not configured (missing API key)' });
  }

  /* ── Forward to OpenRouter ── */
  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'HTTP-Referer': 'https://ammadniazi.github.io/sqp-dashboard',
        'X-Title': 'SQP Analytics Dashboard',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat-v3-0324:free',
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!upstream.ok) {
      const errBody = await upstream.json().catch(() => ({}));
      const msg = errBody?.error?.message || `Upstream error ${upstream.status}`;
      return res.status(502).json({ error: msg });
    }

    const data = await upstream.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) return res.status(502).json({ error: 'Empty response from AI' });

    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: 'Proxy request failed: ' + err.message });
  }
}
