// api/email.js
// Merged email handler — OAuth connect, inbox fetch/send, and Gmail Pub/Sub webhook.
// Routing (by request shape — external URLs are unchanged via vercel.json rewrites):
//   POST + body.message.data → Gmail Pub/Sub webhook
//   ?action=auth or ?code    → OAuth connect / callback (Gmail & Outlook)
//   GET  (everything else)   → Fetch inbox or email body
//   POST (no webhook payload) → Send reply

const { verifyAuth } = require('./_auth');

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

const OUTLOOK_SCOPES = 'offline_access Mail.Read Mail.Send User.Read';
const VALID_PROVIDERS = ['gmail', 'outlook'];

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_URL || 'https://orbytai.org');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Gmail Pub/Sub push notification
  if (req.method === 'POST' && req.body?.message?.data) {
    return handleWebhook(req, res);
  }

  // OAuth initiation or callback
  const { action, code } = req.query;
  if (action === 'auth' || code) {
    return handleConnect(req, res);
  }

  // Fetch inbox / email body / send reply
  return handleMailbox(req, res);
};

// ── OAuth connect handler (was connect-gmail.js) ──────────────────────────────
async function handleConnect(req, res) {
  const { code, state, action, provider } = req.query;
  const base = process.env.APP_URL || 'https://orbytai.org';
  const isOutlookCallback = (state || '').startsWith('outlook:');

  if (action === 'auth') {
    if (provider === 'outlook') {
      if (!process.env.OUTLOOK_CLIENT_ID) {
        return res.status(500).json({ error: 'Outlook OAuth not configured' });
      }
      const redirectUri = process.env.OUTLOOK_REDIRECT_URI || process.env.GMAIL_REDIRECT_URI;
      const params = new URLSearchParams({
        client_id: process.env.OUTLOOK_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: OUTLOOK_SCOPES,
        response_mode: 'query',
        state: 'outlook:' + (state || ''),
      });
      return res.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`);
    }

    if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_REDIRECT_URI) {
      return res.status(500).json({ error: 'Gmail OAuth not configured' });
    }
    const params = new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      redirect_uri: process.env.GMAIL_REDIRECT_URI,
      response_type: 'code',
      scope: GMAIL_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state: state || '',
    });
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  }

  if (code) {
    try {
      if (isOutlookCallback) {
        const userEmail = (state || '').slice(8);
        const redirectUri = process.env.OUTLOOK_REDIRECT_URI || process.env.GMAIL_REDIRECT_URI;
        const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: process.env.OUTLOOK_CLIENT_ID,
            client_secret: process.env.OUTLOOK_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        });
        const tokens = await tokenRes.json();
        if (tokens.error) throw new Error(tokens.error_description || tokens.error);

        const profileRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const profile = await profileRes.json();
        const outlookAddress = profile.mail || profile.userPrincipalName || userEmail;
        await saveOutlookTokens(userEmail, outlookAddress, tokens);
        return res.redirect(`${base}/dashboard?connected=outlook&inbox=${encodeURIComponent(outlookAddress)}`);
      }

      // Gmail callback — state is {nonce}:{email}
      const rawState = state || '';
      const userEmail = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:/.test(rawState)
        ? rawState.slice(37)
        : rawState || 'unknown';
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GMAIL_CLIENT_ID,
          client_secret: process.env.GMAIL_CLIENT_SECRET,
          redirect_uri: process.env.GMAIL_REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });
      const tokens = await tokenRes.json();
      if (tokens.error) throw new Error(tokens.error_description || tokens.error);

      const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileRes.json();
      const gmailAddress = profile.emailAddress || userEmail;
      await saveGmailTokens(userEmail, gmailAddress, tokens);

      if (process.env.GMAIL_PUBSUB_TOPIC) {
        await setupGmailWatch(tokens.access_token);
      }
      return res.redirect(`${base}/dashboard?connected=gmail&inbox=${encodeURIComponent(gmailAddress)}`);
    } catch (err) {
      console.error('OAuth error:', err.message);
      const providerName = isOutlookCallback ? 'outlook' : 'gmail';
      return res.redirect(`${base}/dashboard?error=${providerName}_auth_failed`);
    }
  }

  return res.status(400).json({ error: 'Invalid request. Use ?action=auth to start OAuth flow.' });
}

// ── Mailbox handler (was fetch-emails.js) ─────────────────────────────────────
async function handleMailbox(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authedEmail = await verifyAuth(req);

  // Send reply (POST)
  if (req.method === 'POST') {
    const { email: senderEmail, to, subject, body, threadId, provider: bodyProvider } = req.body || {};
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

      const tokenRecord = await getGmailTokensByUser(senderEmail);
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

  // GET — list or body
  const { email, action, messageId, provider = 'gmail' } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });
  if (authedEmail && authedEmail !== email) return res.status(403).json({ error: 'Forbidden' });
  const safeProvider = VALID_PROVIDERS.includes(provider) ? provider : 'gmail';

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
        const bodyContent = msg.body?.content || '';
        const bodyText = msg.body?.contentType === 'html'
          ? bodyContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          : bodyContent;
        await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRead: true }),
        });
        return res.json({ from: `${fromName} <${from}>`, subject: msg.subject || '(no subject)', date: msg.receivedDateTime || '', body: bodyText.slice(0, 2000) });
      }

      const listRes = await fetch(
        'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=15&$select=id,conversationId,subject,from,receivedDateTime,bodyPreview,isRead',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const listData = await listRes.json();
      const messages = (listData.value || []).slice(0, 12).map(msg => {
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
      return res.json({ emails: messages });
    } catch (err) {
      console.error('fetch-emails outlook error:', err.message);
      return res.json(action === 'body' ? { error: 'Failed to load message' } : { emails: [] });
    }
  }

  // Gmail
  const tokenRecord = await getGmailTokensByUser(email);
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
      const hdrs    = msg.payload?.headers || [];
      const from    = hdrs.find(h => h.name === 'From')?.value || '';
      const subject = hdrs.find(h => h.name === 'Subject')?.value || '(no subject)';
      const date    = hdrs.find(h => h.name === 'Date')?.value || '';
      const body    = extractBody(msg.payload);
      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      });
      return res.json({ from, subject, date, body: body.slice(0, 2000) });
    }

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
          return { id, threadId: msg.threadId, name, from, subject, snippet: (msg.snippet || '').slice(0, 80), date, isUnread: msg.labelIds?.includes('UNREAD') || false, provider: 'gmail' };
        })
        .catch(() => null)
      )
    );
    return res.json({ emails: emails.filter(Boolean) });
  } catch (err) {
    console.error('fetch-emails gmail error:', err.message);
    return res.json(action === 'body' ? { error: 'Failed to load message' } : { emails: [] });
  }
}

// ── Gmail Pub/Sub webhook handler (was gmail-webhook.js) ──────────────────────
async function handleWebhook(req, res) {
  try {
    const message = req.body?.message;
    if (!message?.data) return res.status(200).end();

    const decoded = JSON.parse(Buffer.from(message.data, 'base64').toString());
    const { emailAddress, historyId } = decoded;

    const tokenRecord = await getGmailTokensByAddress(emailAddress);
    if (!tokenRecord) {
      console.log(`No tokens found for ${emailAddress}`);
      return res.status(200).end();
    }

    const accessToken = await getValidGmailTokenByAddress(tokenRecord);
    const histRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${historyId}&historyTypes=messageAdded`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const histData = await histRes.json();
    const added = histData.history?.flatMap(h => h.messagesAdded || []) || [];
    if (!added.length) return res.status(200).end();

    for (const { message: msg } of added) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const full = await msgRes.json();
      const hdrs    = full.payload?.headers || [];
      const subject = hdrs.find(h => h.name === 'Subject')?.value || '(no subject)';
      const from    = hdrs.find(h => h.name === 'From')?.value || '';
      const body    = extractBody(full.payload);

      if (!body || from.includes('noreply') || from.includes('no-reply')) continue;

      const aiReply = await generateReply(body, subject, tokenRecord.BusinessContext);
      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            raw: Buffer.from(buildEmail(from, subject, aiReply)).toString('base64url'),
            threadId: msg.threadId,
          },
        }),
      });
      console.log(`Draft created for email from ${from} (inbox: ${emailAddress})`);
    }

    return res.status(200).end();
  } catch (err) {
    console.error('Gmail webhook error:', err.message);
    return res.status(200).end(); // always 200 so Pub/Sub doesn't retry
  }
}

// ── Shared helpers ─────────────────────────────────────────────────────────────
function escAirtable(val) { return (val || '').replace(/"/g, '\\"'); }

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

// ── Gmail token helpers (by UserEmail — connect + mailbox) ────────────────────
async function saveGmailTokens(userEmail, gmailAddress, tokens) {
  const baseUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/GmailTokens`;
  const authHeader = { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` };
  const safe = escAirtable(userEmail);
  const formula = encodeURIComponent(`OR({UserEmail}="${safe}",FIND("${safe}",{UserEmail})>0)`);
  const searchRes = await fetch(
    `${baseUrl}?filterByFormula=${formula}&sort[0][field]=ExpiresAt&sort[0][direction]=desc&maxRecords=1`,
    { headers: authHeader }
  );
  const existing = (await searchRes.json()).records?.[0];
  const fields = {
    UserEmail: userEmail,
    GmailAddress: gmailAddress,
    AccessToken: tokens.access_token,
    RefreshToken: tokens.refresh_token || existing?.fields?.RefreshToken || '',
    ExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
    Scope: tokens.scope || GMAIL_SCOPES,
  };
  const headers = { 'Content-Type': 'application/json', ...authHeader };
  if (existing) {
    await fetch(`${baseUrl}/${existing.id}`, { method: 'PATCH', headers, body: JSON.stringify({ fields }) });
  } else {
    await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify({ fields }) });
  }
}

async function getGmailTokensByUser(userEmail) {
  const safe = escAirtable(userEmail);
  const formula = encodeURIComponent(`OR({UserEmail}="${safe}",FIND("${safe}",{UserEmail})>0)`);
  const res = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/GmailTokens?filterByFormula=${formula}&sort[0][field]=ExpiresAt&sort[0][direction]=desc&maxRecords=1`,
    { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
  );
  return (await res.json()).records?.[0]?.fields || null;
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

// ── Gmail token helpers (by GmailAddress — webhook only) ─────────────────────
async function getGmailTokensByAddress(gmailAddress) {
  const res = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/GmailTokens?filterByFormula={GmailAddress}="${escAirtable(gmailAddress)}"`,
    { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
  );
  return (await res.json()).records?.[0]?.fields || null;
}

async function getValidGmailTokenByAddress(record) {
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
  const newTokens = await refreshRes.json();
  if (newTokens.error) throw new Error('Token refresh failed: ' + newTokens.error);
  const searchRes = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/GmailTokens?filterByFormula={GmailAddress}="${escAirtable(record.GmailAddress)}"`,
    { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
  );
  const existing = (await searchRes.json()).records?.[0];
  if (existing) {
    await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/GmailTokens/${existing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
      body: JSON.stringify({ fields: { AccessToken: newTokens.access_token, ExpiresAt: new Date(Date.now() + (newTokens.expires_in || 3600) * 1000).toISOString() } }),
    });
  }
  return newTokens.access_token;
}

// ── Outlook token helpers ─────────────────────────────────────────────────────
async function saveOutlookTokens(userEmail, outlookAddress, tokens) {
  const baseUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/OutlookTokens`;
  const authHeader = { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` };
  const searchRes = await fetch(
    `${baseUrl}?filterByFormula={UserEmail}="${escAirtable(userEmail)}"`,
    { headers: authHeader }
  );
  const existing = (await searchRes.json()).records?.[0];
  const fields = {
    UserEmail: userEmail,
    OutlookAddress: outlookAddress,
    AccessToken: tokens.access_token,
    RefreshToken: tokens.refresh_token || existing?.fields?.RefreshToken || '',
    ExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
    Scope: tokens.scope || OUTLOOK_SCOPES,
  };
  const headers = { 'Content-Type': 'application/json', ...authHeader };
  if (existing) {
    await fetch(`${baseUrl}/${existing.id}`, { method: 'PATCH', headers, body: JSON.stringify({ fields }) });
  } else {
    await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify({ fields }) });
  }
}

async function getOutlookTokens(userEmail) {
  const res = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/OutlookTokens?filterByFormula={UserEmail}="${escAirtable(userEmail)}"`,
    { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
  );
  return (await res.json()).records?.[0]?.fields || null;
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

// ── Gmail setup helpers ───────────────────────────────────────────────────────
async function setupGmailWatch(accessToken) {
  await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ topicName: process.env.GMAIL_PUBSUB_TOPIC, labelIds: ['INBOX'] }),
  });
}

async function generateReply(emailBody, subject, businessContext) {
  const ctx = businessContext ? `Business context: ${businessContext}. ` : '';
  const prompt = `You are a helpful AI assistant for a small local business. ${ctx}A customer sent this email with subject "${subject}":

"${emailBody.slice(0, 800)}"

Write a professional, warm, helpful reply. Keep it concise. Sign off as "The Team".
Write only the reply body text, no subject line.`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'Thank you for your message. We will get back to you shortly.';
}

function buildEmail(to, subject, body) {
  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
  return [`To: ${to}`, `Subject: ${replySubject}`, 'Content-Type: text/plain; charset=utf-8', '', body].join('\r\n');
}
