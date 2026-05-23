// api/fetch-emails.js
// Handles actions via ?action= query param:
//   list  — returns recent Gmail inbox messages (default)
//   body  — returns full body of a single message by ID
//   send  — sends a reply via Gmail (POST, JSON body)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // ── SEND (POST) ───────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { email, to, subject, body, threadId } = req.body || {};
    if (!email || !to || !body) return res.status(400).json({ error: 'email, to, body required' });
    const tokenRecord = await getGmailTokens(email);
    if (!tokenRecord) return res.status(404).json({ error: 'Not connected' });
    try {
      const accessToken = await getValidAccessToken(tokenRecord);
      const replySubject = subject?.startsWith('Re:') ? subject : `Re: ${subject || ''}`;
      const mime = [
        `To: ${to}`,
        `Subject: ${replySubject}`,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        body,
      ].join('\r\n');
      const raw = Buffer.from(mime).toString('base64url');
      const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
      });
      const result = await sendRes.json();
      if (result.error) throw new Error(result.error.message);
      return res.json({ ok: true, id: result.id });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const { email, action, messageId } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });

  const tokenRecord = await getGmailTokens(email);
  if (!tokenRecord) return res.json(action === 'body' ? { error: 'Not connected' } : { emails: [] });

  try {
    const accessToken = await getValidAccessToken(tokenRecord);

    // ── BODY: fetch full email content ────────────────────────────────────
    if (action === 'body') {
      if (!messageId) return res.status(400).json({ error: 'messageId required' });

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
    }

    // ── LIST: recent inbox messages ───────────────────────────────────────
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=15',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listRes.json();
    if (!listData.messages?.length) return res.json({ emails: [] });

    const emails = await Promise.all(
      listData.messages.slice(0, 12).map(({ id }) =>
        fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        .then(r => r.json())
        .then(msg => {
          const hdrs    = msg.payload?.headers || [];
          const from    = hdrs.find(h => h.name === 'From')?.value || '';
          const subject = hdrs.find(h => h.name === 'Subject')?.value || '(no subject)';
          const date    = hdrs.find(h => h.name === 'Date')?.value || '';
          const nameMatch = from.match(/^"?([^"<]+)"?\s*<?/);
          const name = (nameMatch?.[1] || from).trim().replace(/"/g, '');
          return {
            id, threadId: msg.threadId, name, from, subject,
            snippet: (msg.snippet || '').slice(0, 80),
            date,
            isUnread: msg.labelIds?.includes('UNREAD') || false,
          };
        })
        .catch(() => null)
      )
    );

    return res.json({ emails: emails.filter(Boolean) });
  } catch (err) {
    console.error('fetch-emails error:', err.message);
    return res.json(action === 'body' ? { error: err.message } : { emails: [] });
  }
};

function extractBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data)
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data)
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data)
        return Buffer.from(part.body.data, 'base64').toString('utf-8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }
  if (payload.body?.data) return Buffer.from(payload.body.data, 'base64').toString('utf-8');
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
  const t = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: record.RefreshToken,
      grant_type: 'refresh_token',
    }),
  }).then(r => r.json());
  if (t.error) throw new Error('Token refresh failed');
  return t.access_token;
}
