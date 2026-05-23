// api/connect-gmail.js
// Gmail OAuth2 flow. Client clicks "Connect Gmail" in dashboard → Google consent → back here.
// Tokens are saved to Airtable GmailTokens table so gmail-webhook.js can use them.

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

module.exports = async function handler(req, res) {
  const { code, state, action } = req.query;

  // Step 1: Dashboard calls /api/connect-gmail?action=auth&state=USER_EMAIL
  if (action === 'auth') {
    if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_REDIRECT_URI) {
      return res.status(500).json({ error: 'Gmail OAuth not configured. Add GMAIL_CLIENT_ID and GMAIL_REDIRECT_URI to Vercel env vars.' });
    }
    const params = new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      redirect_uri: process.env.GMAIL_REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state: state || '',
    });
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  }

  // Step 2: Google redirects back with ?code=...&state=USER_EMAIL
  if (code) {
    try {
      // Exchange auth code for tokens
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

      const userEmail = state || 'unknown';

      // Get the Gmail address these tokens belong to
      const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileRes.json();
      const gmailAddress = profile.emailAddress || userEmail;

      // Save tokens to Airtable
      await saveGmailTokens(userEmail, gmailAddress, tokens);

      // Optionally set up Gmail push notifications (requires Pub/Sub topic)
      if (process.env.GMAIL_PUBSUB_TOPIC) {
        await setupGmailWatch(tokens.access_token);
      }

      const base = process.env.APP_URL || 'https://orbytai.org';
      return res.redirect(`${base}/dashboard?connected=gmail&inbox=${encodeURIComponent(gmailAddress)}`);
    } catch (err) {
      console.error('Gmail OAuth error:', err.message);
      const base = process.env.APP_URL || 'https://orbytai.org';
      return res.redirect(`${base}/dashboard?error=gmail_auth_failed`);
    }
  }

  return res.status(400).json({ error: 'Invalid request. Use ?action=auth to start OAuth flow.' });
};

async function saveGmailTokens(userEmail, gmailAddress, tokens) {
  const baseUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/GmailTokens`;
  const authHeader = { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` };

  // Check if a record already exists for this user
  const searchRes = await fetch(
    `${baseUrl}?filterByFormula={UserEmail}="${userEmail}"`,
    { headers: authHeader }
  );
  const searchData = await searchRes.json();
  const existing = searchData.records?.[0];

  const fields = {
    UserEmail: userEmail,
    GmailAddress: gmailAddress,
    AccessToken: tokens.access_token,
    // Keep existing refresh token if Google didn't return a new one (only returned on first auth)
    RefreshToken: tokens.refresh_token || existing?.fields?.RefreshToken || '',
    ExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
    Scope: tokens.scope || SCOPES,
  };

  const headers = { 'Content-Type': 'application/json', ...authHeader };

  if (existing) {
    await fetch(`${baseUrl}/${existing.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ fields }),
    });
  } else {
    await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ fields }),
    });
  }
}

async function setupGmailWatch(accessToken) {
  await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topicName: process.env.GMAIL_PUBSUB_TOPIC,
      labelIds: ['INBOX'],
    }),
  });
}
