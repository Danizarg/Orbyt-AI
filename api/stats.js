// api/stats.js
const { getMessages } = require('./airtable.js');
const { verifyAuth } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_URL || 'https://orbytai.org');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const authedEmail = await verifyAuth(req);
  if (!authedEmail) return res.status(401).json({ error: 'Authentication required' });

  const { client } = req.query;
  if (!client) return res.status(400).json({ error: 'Missing client' });
  try {
    const messages = await getMessages(client, 100);
    return res.status(200).json({ totalMessages: messages.length, messages });
  } catch (err) {
    console.error('stats error:', err.message);
    return res.status(500).json({ error: 'Failed to load stats' });
  }
};
