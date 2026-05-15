// api/connect-gmail.js
// Handles Gmail OAuth2 — client clicks "Connect Gmail", gets redirected here,
// we exchange the code for tokens and save them for that client.
//
// SETUP (one-time, free):
// 1. Go to https://console.cloud.google.com
// 2. Create a project → Enable "Gmail API"
// 3. OAuth consent screen → External → add your email as test user
// 4. Credentials → Create OAuth Client ID → Web Application
//    Redirect URI: https://YOUR-VERCEL-URL.vercel.app/api/connect-gmail
// 5. Copy Client ID and Client Secret → add to Vercel env vars

import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI // e.g. https://yourapp.vercel.app/api/connect-gmail
);

export default async function handler(req, res) {
  const { code, state, action } = req.query;

  // Step 1: Redirect user to Google consent screen
  if (action === 'auth') {
    const clientId = state; // pass client slug e.g. "salon-rosa"
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
      ],
      state: clientId,
      prompt: 'consent',
    });
    return res.redirect(url);
  }

  // Step 2: Google redirects back here with ?code=...
  if (code) {
    try {
      const { tokens } = await oauth2Client.getToken(code);
      const clientSlug = state || 'default';

      // In production: save tokens to a database (Airtable, Supabase, etc.)
      // For now we log them — replace this with your DB save call
      console.log(`Tokens for client [${clientSlug}]:`, JSON.stringify(tokens));

      // TODO: save to Airtable
      // await saveTokensToAirtable(clientSlug, tokens);

      // Redirect back to dashboard with success
      return res.redirect(`/?connected=gmail&client=${clientSlug}`);
    } catch (err) {
      console.error('OAuth error:', err);
      return res.redirect('/?error=gmail_auth_failed');
    }
  }

  return res.status(400).json({ error: 'Invalid request' });
}
