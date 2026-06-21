// api/draft.js — AI draft generation + route optimisation
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_URL || 'https://orbytai.org');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, prompt, origin, stops } = req.body || {};

  // ── Route optimisation ───────────────────────────────────────────────────
  if (action === 'route') {
    const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!mapsKey) return res.status(500).json({ error: 'Maps not configured' });
    if (!origin || !Array.isArray(stops) || !stops.length)
      return res.status(400).json({ error: 'Missing origin or stops' });

    const wpParam = stops.map(s => encodeURIComponent(s)).join('|');
    const url = `https://maps.googleapis.com/maps/api/directions/json`
      + `?origin=${encodeURIComponent(origin)}`
      + `&destination=${encodeURIComponent(origin)}`
      + `&waypoints=optimize:true|${wpParam}`
      + `&mode=driving&key=${mapsKey}`;

    const r = await fetch(url);
    const data = await r.json();
    if (data.status !== 'OK')
      return res.status(400).json({ error: 'Route error: ' + data.status });

    const route = data.routes[0];
    const orderedStops = route.waypoint_order.map(i => stops[i]);
    return res.json({
      orderedStops,
      legs: route.legs.map(l => ({
        duration: l.duration.text,
        durationSec: l.duration.value,
        distance: l.distance.text,
        distanceM: l.distance.value,
      })),
    });
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
