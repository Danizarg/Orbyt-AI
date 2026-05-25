// api/stats.js
const { getMessages } = require('./airtable.js');
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_URL || 'https://orbytai.org');
  if (req.method !== 'GET') return res.status(405).end();
  const { client } = req.query;
  if (!client) return res.status(400).json({ error: 'Missing client' });
  try {
    const messages = await getMessages(client, 100);
    return res.status(200).json({ totalMessages: messages.length, messages });
  } catch (err) { return res.status(500).json({ error: 'Error' }); }
};
