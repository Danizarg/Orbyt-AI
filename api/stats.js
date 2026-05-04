// api/stats.js — Returns live stats for a client from Airtable
const { getStats } = require('./airtable.js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();
  const { client } = req.query;
  if (!client) return res.status(400).json({ error: 'Missing client slug' });
  try {
    const stats = await getStats(client);
    return res.status(200).json(stats);
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: 'Could not load stats' });
  }
};
