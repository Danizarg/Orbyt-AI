// api/connect-gmail.js
// Handles Gmail AND Microsoft Outlook OAuth2 flows.
// Gmail:   ?action=auth&state=USER_EMAIL              → state stored as-is
// Outlook: ?action=auth&provider=outlook&state=EMAIL  → state stored as "outlook:EMAIL"
// Both providers callback here with ?code=...&state=...

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

const OUTLOOK_SCOPES = 'offline_access Mail.Read Mail.Send User.Read';

module.exports = async function handler(req, res) {
  const { code, state, action, provider } = req.query;
  const base = process.env.APP_URL || 'https://orbytai.org';
  const isOutlookCallback = (state || '').startsWith('outlook:');

  // ── STEP 1: Initiate OAuth ────────────────────────────────────────────────
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

    // Gmail
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

  // ── STEP 2: OAuth callback (both providers come back here) ────────────────
  if (code) {
    try {
      if (isOutlookCallback) {
        const userEmail = (state || '').slice(8); // strip "outlook:" prefix
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

      // Gmail callback
      const userEmail = state || 'unknown';
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
};

function escAirtable(val) { return (val || '').replace(/"/g, '\\"'); }

// ── Gmail helpers ─────────────────────────────────────────────────────────────
async function saveGmailTokens(userEmail, gmailAddress, tokens) {
  const baseUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/GmailTokens`;
  const authHeader = { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` };

  const searchRes = await fetch(
    `${baseUrl}?filterByFormula={UserEmail}="${escAirtable(userEmail)}"`,
    { headers: authHeader }
  );
  const searchData = await searchRes.json();
  const existing = searchData.records?.[0];

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

async function setupGmailWatch(accessToken) {
  await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ topicName: process.env.GMAIL_PUBSUB_TOPIC, labelIds: ['INBOX'] }),
  });
}

// ── Outlook helpers ───────────────────────────────────────────────────────────
async function saveOutlookTokens(userEmail, outlookAddress, tokens) {
  const baseUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/OutlookTokens`;
  const authHeader = { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` };

  const searchRes = await fetch(
    `${baseUrl}?filterByFormula={UserEmail}="${escAirtable(userEmail)}"`,
    { headers: authHeader }
  );
  const searchData = await searchRes.json();
  const existing = searchData.records?.[0];

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
