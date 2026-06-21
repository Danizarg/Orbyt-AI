// api/fetch-emails.js
// Handles actions via ?action= and ?provider= query params:
//   provider=gmail  (default) — Gmail API
//   provider=outlook          — Microsoft Graph API
//
// GET  ?action=list  — recent inbox messages
// GET  ?action=body  — full body of a single message by ID
// POST              — send a reply

const { verifyAuth } = require('./_auth');
const VALID_PROVIDERS = ['gmail', 'outlook'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_URL || 'https://orbytai.org');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authedEmail = await verifyAuth(req);

  const { email, action, messageId, provider = 'gmail' } = req.query;

  // ── SEND (POST) ───────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { email: bodyEmail, to, subject, body, threadId, provider: bodyProvider } = req.body || {};
    const senderEmail = bodyEmail;
    const prov = VALID_PROVIDERS.includes(bodyProvider) ? bodyProvider : 'gmail';
    if (!senderEmail || !to || !body) return res.status(400).json({ error: 'email, to, body required' });
    if (authedEmail && authedEmail !== senderEmail) return res.status(403).json({ error: 'Forbidden' });

    try {
      if (prov === 'outlook') {
        const tokenRecord = await getOutlookTokens(senderEmail);
        if (!tokenRecord) return res.status(404).json({ error: 'Outlook not connected' });
        const accessToken = await getValidOutlookToken(tokenRecord);
        const replySubject = subject?.startsWith('Re:') ? subject : `Re: ${subject || ''}`;
        const sendRes = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              subject: replySubject,
              body: { contentType: 'Text', content: body },
              toRecipients: [{ emailAddress: { address: to } }],
            },
            saveToSentItems: true,
          }),
        });
        if (sendRes.status === 202) return res.json({ ok: true });
        const result = await sendRes.json();
        if (result.error) throw new Error(result.error.message);
        return res.json({ ok: true });
      }

      // Gmail send
      const tokenRecord = await getGmailTokens(senderEmail);
      if (!tokenRecord) return res.status(404).json({ error: 'Gmail not connected' });
      const accessToken = await getValidGmailToken(tokenRecord);
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
      console.error('send error:', err.message);
      return res.status(500).json({ error: 'Failed to send message' });
    }
  }

  if (!email) return res.status(400).json({ error: 'email required' });
  if (authedEmail && authedEmail !== email) return res.status(403).json({ error: 'Forbidden' });
  const safeProvider = VALID_PROVIDERS.includes(provider) ? provider : 'gmail';

  // ── OUTLOOK ───────────────────────────────────────────────────────────────
  if (safeProvider === 'outlook') {
    const tokenRecord = await getOutlookTokens(email);
    if (!tokenRecord) return res.json(action === 'body' ? { error: 'Not connected' } : { emails: [] });

    try {
      const accessToken = await getValidOutlookToken(tokenRecord);

      if (action === 'body') {
        if (!messageId) return res.status(400).json({ error: 'messageId required' });
        const msgRes = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages/${messageId}?$select=subject,from,body,receivedDateTime,toRecipients,conversationId`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const msg = await msgRes.json();
        const from = msg.from?.emailAddress?.address || '';
        const fromName = msg.from?.emailAddress?.name || from;
        const subject = msg.subject || '(no subject)';
        const date = msg.receivedDateTime || '';
        const bodyContent = msg.body?.content || '';
        const bodyText = msg.body?.contentType === 'html'
          ? bodyContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          : bodyContent;

        // Mark as read
        await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRead: true }),
        });

        return res.json({ from: `${fromName} <${from}>`, subject, date, body: bodyText.slice(0, 2000) });
      }

      // List inbox
      const listRes = await fetch(
        'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=15&$select=id,conversationId,subject,from,receivedDateTime,bodyPreview,isRead',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const listData = await listRes.json();
      const messages = listData.value || [];
      if (!messages.length) return res.json({ emails: [] });

      const emails = messages.slice(0, 12).map(msg => {
        const fromAddr = msg.from?.emailAddress?.address || '';
        const fromName = msg.from?.emailAddress?.name || fromAddr;
        return {
          id: msg.id,
          threadId: msg.conversationId || '',
          name: fromName,
          from: `${fromName} <${fromAddr}>`,
          subject: msg.subject || '(no subject)',
          snippet: (msg.bodyPreview || '').slice(0, 80),
          date: msg.receivedDateTime || '',
          isUnread: !msg.isRead,
          provider: 'outlook',
        };
      });

      return res.json({ emails });
    } catch (err) {
      console.error('fetch-emails outlook error:', err.message);
      return res.json(action === 'body' ? { error: 'Failed to load message' } : { emails: [] });
    }
  }

  // ── GMAIL (default) ───────────────────────────────────────────────────────
  const tokenRecord = await getGmailTokens(email);
  if (!tokenRecord) return res.json(action === 'body' ? { error: 'Not connected' } : { emails: [] });

  try {
    const accessToken = await getValidGmailToken(tokenRecord);

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

      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      });

      return res.json({ from, subject, date, body: body.slice(0, 2000) });
    }

    // List inbox
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
            provider: 'gmail',
          };
        })
        .catch(() => null)
      )
    );

    return res.json({ emails: emails.filter(Boolean) });
  } catch (err) {
    console.error('fetch-emails gmail error:', err.message);
    return res.json(action === 'body' ? { error: 'Failed to load message' } : { emails: [] });
  }
};

// ── Body extraction ───────────────────────────────────────────────────────────
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

function escAirtable(val) { return (val || '').replace(/"/g, '\\"'); }

// ── Gmail token helpers ───────────────────────────────────────────────────────
async function getGmailTokens(userEmail) {
  const safe = escAirtable(userEmail);
  // Support both current format (email) and legacy format ({uuid}:email)
  const formula = encodeURIComponent(`OR({UserEmail}="${safe}",FIND("${safe}",{UserEmail})>0)`);
  const res = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/GmailTokens?filterByFormula=${formula}&sort[0][field]=ExpiresAt&sort[0][direction]=desc&maxRecords=1`,
    { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
  );
  const data = await res.json();
  return data.records?.[0]?.fields || null;
}

async function getValidGmailToken(record) {
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
  if (t.error) throw new Error('Gmail token refresh failed');
  const searchRes = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/GmailTokens?filterByFormula={UserEmail}="${escAirtable(record.UserEmail)}"`,
    { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
  );
  const existing = (await searchRes.json()).records?.[0];
  if (existing) {
    await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/GmailTokens/${existing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
      body: JSON.stringify({ fields: { AccessToken: t.access_token, ExpiresAt: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString() } }),
    });
  }
  return t.access_token;
}

// ── Outlook token helpers ─────────────────────────────────────────────────────
async function getOutlookTokens(userEmail) {
  const res = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/OutlookTokens?filterByFormula={UserEmail}="${escAirtable(userEmail)}"`,
    { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
  );
  const data = await res.json();
  return data.records?.[0]?.fields || null;
}

async function getValidOutlookToken(record) {
  const expiresAt = new Date(record.ExpiresAt).getTime();
  if (Date.now() < expiresAt - 5 * 60 * 1000) return record.AccessToken;
  const t = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.OUTLOOK_CLIENT_ID,
      client_secret: process.env.OUTLOOK_CLIENT_SECRET,
      refresh_token: record.RefreshToken,
      grant_type: 'refresh_token',
      scope: 'offline_access Mail.Read Mail.Send User.Read',
    }),
  }).then(r => r.json());
  if (t.error) throw new Error('Outlook token refresh failed');
  const searchRes = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/OutlookTokens?filterByFormula={UserEmail}="${escAirtable(record.UserEmail)}"`,
    { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
  );
  const existing = (await searchRes.json()).records?.[0];
  if (existing) {
    await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/OutlookTokens/${existing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
      body: JSON.stringify({ fields: { AccessToken: t.access_token, ExpiresAt: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString() } }),
    });
  }
  return t.access_token;
}
