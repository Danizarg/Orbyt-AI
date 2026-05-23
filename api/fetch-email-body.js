// api/fetch-email-body.js
// Fetches the full body of a single Gmail message by ID.
// Called when a user clicks on an email in the inbox.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { email, messageId } = req.query;
  if (!email || !messageId) return res.status(400).json({ error: 'email and messageId required' });

  const tokenRecord = await getGmailTokens(email);
  if (!tokenRecord) return res.status(404).json({ error: 'Not connected' });

  try {
    const accessToken = await getValidAccessToken(tokenRecord);

    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const msg = await msgRes.json();

    const headers = msg.payload?.headers || [];
    const from    = headers.find(h => h.name === 'From')?.value || '';
    const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
    const date    = headers.find(h => h.name === 'Date')?.value || '';
    const body    = extractBody(msg.payload);

    // Mark as read
    await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    });

    return res.json({ from, subject, date, body: body.slice(0, 2000) });
  } catch (err) {
    console.error('fetch-email-body error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

function extractBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data)
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  if (payload.parts) {
    // Prefer plain text
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data)
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
    // Fall back to html, strip tags
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      // Recurse into nested parts
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }
  if (payload.body?.data)
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  return '';
}

async function getGmailTokens(userEmail) {
  const res = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/GmailTokens?filterByFormula={UserEmail}="${userEmail}"`,
    { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
  );
  const data = await res.json();
  return data.records?.[0]?.fields || null;
}

async function getValidAccessToken(record) {
  const expiresAt = new Date(record.ExpiresAt).getTime();
  if (Date.now() < expiresAt - 5 * 60 * 1000) return record.AccessToken;
  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: record.RefreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const t = await refreshRes.json();
  if (t.error) throw new Error('Token refresh failed');
  return t.access_token;
}
