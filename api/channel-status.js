// api/channel-status.js
// GET  ?email=...                                 — which channels are connected
// POST { action:'disconnect', provider, email }   — delete tokens for that provider

const { verifyAuth } = require('./_auth');

const TABLES = {
  gmail: 'GmailTokens',
  outlook: 'OutlookTokens',
  instagram: 'InstagramTokens',
};

function escAirtable(val) { return (val || '').replace(/"/g, '\\"'); }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_URL || 'https://orbytai.org');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authedEmail = await verifyAuth(req);

  // Disconnect: POST only (CSRF protection)
  if (req.method === 'POST') {
    const { action, provider, email } = req.body || {};
    if (action !== 'disconnect') return res.status(400).json({ error: 'invalid action' });
    if (!email) return res.status(400).json({ error: 'email required' });
    if (authedEmail && authedEmail !== email) return res.status(403).json({ error: 'Forbidden' });
    const table = TABLES[provider];
    if (!table) return res.status(400).json({ error: 'unknown provider' });
    try {
      const recordId = await findRecordId(table, email);
      if (recordId) await deleteRecord(table, recordId);
      return res.json({ ok: true });
    } catch (err) {
      console.error('disconnect error:', err.message);
      return res.status(500).json({ error: 'Disconnect failed' });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });
  if (authedEmail && authedEmail !== email) return res.status(403).json({ error: 'Forbidden' });

  const [gmail, outlook, instagram] = await Promise.all([
    checkGmail(email),
    checkOutlook(email),
    checkInstagram(email),
  ]);

  return res.json({ gmail, outlook, instagram });
};

async function findRecordId(table, userEmail) {
  const res = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${table}?filterByFormula={UserEmail}="${escAirtable(userEmail)}"&fields[]=UserEmail`,
    { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
  );
  const data = await res.json();
  return data.records?.[0]?.id || null;
}

async function deleteRecord(table, recordId) {
  const res = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${table}/${recordId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
  );
  if (!res.ok) throw new Error('Airtable delete failed: ' + res.status);
  return true;
}

async function checkGmail(userEmail) {
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/GmailTokens?filterByFormula={UserEmail}="${escAirtable(userEmail)}"`,
      { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
    );
    const data = await res.json();
    const record = data.records?.[0];
    if (!record) return { connected: false };
    return { connected: true, inbox: record.fields.GmailAddress || '' };
  } catch {
    return { connected: false };
  }
}

async function checkOutlook(userEmail) {
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/OutlookTokens?filterByFormula={UserEmail}="${escAirtable(userEmail)}"`,
      { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
    );
    const data = await res.json();
    const record = data.records?.[0];
    if (!record) return { connected: false };
    return { connected: true, inbox: record.fields.OutlookAddress || '' };
  } catch {
    return { connected: false };
  }
}

async function checkInstagram(userEmail) {
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/InstagramTokens?filterByFormula={UserEmail}="${escAirtable(userEmail)}"`,
      { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
    );
    const data = await res.json();
    const record = data.records?.[0];
    if (!record) return { connected: false };
    return { connected: true, account: record.fields.InstagramUsername || '' };
  } catch {
    return { connected: false };
  }
}
