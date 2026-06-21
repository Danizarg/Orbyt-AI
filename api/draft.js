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
    // Use a server-side key (no HTTP-referrer restriction) so Google doesn't deny
    // server-to-server calls. Falls back to GOOGLE_MAPS_API_KEY if SERVER_KEY not set.
    const mapsKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (!mapsKey) return res.status(500).json({ error: 'Maps not configured' });
    if (!origin || !Array.isArray(stops) || !stops.length)
      return res.status(400).json({ error: 'Missing origin or stops' });

    // Resolve any Google Maps URLs (short links, place URLs) to plain addresses
    const [resolvedOrigin, ...resolvedStops] = await Promise.all(
      [origin, ...stops].map(resolveAddress)
    );

    const wpParam = resolvedStops.map(s => encodeURIComponent(s)).join('|');
    const url = `https://maps.googleapis.com/maps/api/directions/json`
      + `?origin=${encodeURIComponent(resolvedOrigin)}`
      + `&destination=${encodeURIComponent(resolvedOrigin)}`
      + `&waypoints=optimize:true|${wpParam}`
      + `&mode=driving&key=${mapsKey}`;

    const r = await fetch(url);
    const data = await r.json();
    if (data.status !== 'OK')
      return res.status(400).json({ error: 'Route error: ' + data.status });

    const route = data.routes[0];
    const orderedStops = route.waypoint_order.map(i => resolvedStops[i]);
    return res.json({
      origin: resolvedOrigin,
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

// Resolve a Google Maps URL (short link or place URL) to a plain address string.
// Follows redirects then extracts place name, ?q= param, or @lat,lng coords.
async function resolveAddress(str) {
  if (!str || !str.startsWith('http')) return str;
  try {
    const r = await fetch(str, { redirect: 'follow', signal: AbortSignal.timeout(4000) });
    const url = new URL(r.url);
    const placeMatch = url.pathname.match(/\/maps\/place\/([^/@]+)/);
    if (placeMatch) return decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
    const q = url.searchParams.get('q');
    if (q) return q;
    const coordMatch = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (coordMatch) return `${coordMatch[1]},${coordMatch[2]}`;
  } catch {}
  return str;
}
