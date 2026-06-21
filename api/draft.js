// api/draft.js — AI draft generation + route URL resolution
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_URL || 'https://orbytai.org');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, prompt, origin, stops } = req.body || {};

  // ── Route: resolve Google Maps short-links → plain addresses ────────────
  // Geocoding and route optimisation happen client-side (OSRM + Nominatim).
  if (action === 'route') {
    if (!origin || !Array.isArray(stops) || !stops.length)
      return res.status(400).json({ error: 'Missing origin or stops' });
    const all = await Promise.all([origin, ...stops].map(resolveAddress));
    return res.json({ origin: all[0], stops: all.slice(1) });
  }

  // ── AI draft ─────────────────────────────────────────────────────────────
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY not set' });
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!response.ok) { console.error('Groq error:', await response.text()); return res.status(502).json({ error: 'AI service error' }); }
    const data = await response.json();
    return res.status(200).json({ reply: data.choices?.[0]?.message?.content || '' });
  } catch (err) { return res.status(500).json({ error: 'Internal server error' }); }
};

// Follow redirects on a Google Maps URL and extract a usable address string.
async function resolveAddress(str) {
  if (!str || !str.startsWith('http')) return str;
  try {
    const r = await fetch(str, { redirect: 'follow', signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    const url = new URL(r.url);
    const placeMatch = url.pathname.match(/\/maps\/place\/([^/@]+)/);
    if (placeMatch) return decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ');
    const q = url.searchParams.get('q');
    if (q) return q;
    const coordMatch = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (coordMatch) return `${coordMatch[1]},${coordMatch[2]}`;
  } catch {}
  return str;
}
