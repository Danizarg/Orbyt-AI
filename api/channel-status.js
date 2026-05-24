// api/channel-status.js
// GET ?email=...                                  — which channels are connected
// GET ?action=disconnect&provider=X&email=...     — delete tokens for that provider

const TABLES = {
  gmail: 'GmailTokens',
  outlook: 'OutlookTokens',
  instagram: 'InstagramTokens',
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { email, action, provider } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });

  // Disconnect: delete the Airtable record for this user + provider
  if (action === 'disconnect') {
    const table = TABLES[provider];
    if (!table) return res.status(400).json({ error: 'unknown provider' });
    try {
      const recordId = await findRecordId(table, email);
      if (recordId) await deleteRecord(table, recordId);
      return res.json({ ok: true });
    } catch (err) {
      console.error('disconnect error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  const [gmail, outlook, instagram] = await Promise.all([
    checkGmail(email),
    checkOutlook(email),
    checkInstagram(email),
  ]);

  return res.json({ gmail, outlook, instagram });
};

async function findRecordId(table, userEmail) {
  const res = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${table}?filterByFormula={UserEmail}="${userEmail}"&fields[]=UserEmail`,
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
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/GmailTokens?filterByFormula={UserEmail}="${userEmail}"`,
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
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/OutlookTokens?filterByFormula={UserEmail}="${userEmail}"`,
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
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/InstagramTokens?filterByFormula={UserEmail}="${userEmail}"`,
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
