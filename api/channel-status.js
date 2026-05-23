// api/channel-status.js
// Returns which channels a user has connected (Gmail, Instagram).
// Called by the dashboard on every load to restore connected state.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });

  const [gmail, instagram] = await Promise.all([
    checkGmail(email),
    checkInstagram(email),
  ]);

  return res.json({ gmail, instagram });
};

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
