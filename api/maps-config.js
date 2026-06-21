// api/maps-config.js — Returns the Google Maps public API key for frontend use.
// The key is restricted to orbytai.org/* in Google Cloud Console.

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_URL || 'https://orbytai.org');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return res.status(500).json({ error: 'Maps not configured' });
  }
  res.json({ apiKey: process.env.GOOGLE_MAPS_API_KEY });
};
