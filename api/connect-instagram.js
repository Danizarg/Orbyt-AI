// api/connect-instagram.js
// Meta OAuth flow. Client clicks "Connect Instagram" → Facebook login → back here.
// Saves Page access token + Instagram account ID to Airtable InstagramTokens table.
// Uses Meta Graph API v18 — no packages needed.

const GRAPH = 'https://graph.facebook.com/v18.0';
const SCOPES = 'instagram_basic,instagram_manage_messages,pages_show_list,pages_manage_metadata,pages_messaging';

module.exports = async function handler(req, res) {
  const { code, state, action } = req.query;

  // Step 1: Dashboard calls /api/connect-instagram?action=auth&state=USER_EMAIL
  if (action === 'auth') {
    if (!process.env.META_APP_ID || !process.env.META_REDIRECT_URI) {
      return res.status(500).json({ error: 'Instagram OAuth not configured. Add META_APP_ID and META_REDIRECT_URI to Vercel env vars.' });
    }
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID,
      redirect_uri: process.env.META_REDIRECT_URI,
      scope: SCOPES,
      response_type: 'code',
      state: state || '',
    });
    return res.redirect(`https://www.facebook.com/v18.0/dialog/oauth?${params}`);
  }

  // Step 2: Meta redirects back with ?code=...&state=USER_EMAIL
  if (code) {
    try {
      const userEmail = state || 'unknown';

      // Exchange code for short-lived user token
      const tokenRes = await fetch(
        `${GRAPH}/oauth/access_token?` + new URLSearchParams({
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          redirect_uri: process.env.META_REDIRECT_URI,
          code,
        })
      );
      const tokenData = await tokenRes.json();
      if (tokenData.error) throw new Error(tokenData.error.message);

      // Exchange for long-lived user token (60 days)
      const longRes = await fetch(
        `${GRAPH}/oauth/access_token?` + new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          fb_exchange_token: tokenData.access_token,
        })
      );
      const longToken = await longRes.json();
      if (longToken.error) throw new Error(longToken.error.message);

      // Get all Facebook Pages this user manages
      const pagesRes = await fetch(
        `${GRAPH}/me/accounts?access_token=${longToken.access_token}`
      );
      const pagesData = await pagesRes.json();
      const pages = pagesData.data || [];
      if (!pages.length) throw new Error('No Facebook Pages found. Make sure you have a Facebook Page connected to your Instagram Business account.');

      // Find the page that has an Instagram Business account connected
      let savedAccount = null;
      for (const page of pages) {
        const igRes = await fetch(
          `${GRAPH}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
        );
        const igData = await igRes.json();
        const igAccountId = igData.instagram_business_account?.id;
        if (!igAccountId) continue;

        // Get Instagram username for display
        const igProfileRes = await fetch(
          `${GRAPH}/${igAccountId}?fields=username&access_token=${page.access_token}`
        );
        const igProfile = await igProfileRes.json();

        await saveInstagramTokens(userEmail, {
          pageId: page.id,
          pageName: page.name,
          pageAccessToken: page.access_token,
          instagramAccountId: igAccountId,
          instagramUsername: igProfile.username || igAccountId,
        });

        // Subscribe this page to webhook events
        await subscribePageWebhook(page.id, page.access_token);

        savedAccount = igProfile.username || page.name;
        break; // use the first connected page
      }

      if (!savedAccount) throw new Error('No Instagram Business account found linked to your Facebook Pages.');

      return res.redirect(`/dashboard?connected=instagram&account=${encodeURIComponent(savedAccount)}`);
    } catch (err) {
      console.error('Instagram OAuth error:', err.message);
      return res.redirect('/dashboard?error=instagram_auth_failed&msg=' + encodeURIComponent(err.message));
    }
  }

  return res.status(400).json({ error: 'Invalid request. Use ?action=auth to start OAuth flow.' });
};

function escAirtable(val) { return (val || '').replace(/"/g, '\\"'); }

async function saveInstagramTokens(userEmail, data) {
  const baseUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/InstagramTokens`;
  const authHeader = { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` };

  const searchRes = await fetch(
    `${baseUrl}?filterByFormula={UserEmail}="${escAirtable(userEmail)}"`,
    { headers: authHeader }
  );
  const searchData = await searchRes.json();
  const existing = searchData.records?.[0];

  const fields = {
    UserEmail: userEmail,
    PageId: data.pageId,
    PageName: data.pageName,
    PageAccessToken: data.pageAccessToken,
    InstagramAccountId: data.instagramAccountId,
    InstagramUsername: data.instagramUsername,
  };

  const headers = { 'Content-Type': 'application/json', ...authHeader };
  if (existing) {
    await fetch(`${baseUrl}/${existing.id}`, { method: 'PATCH', headers, body: JSON.stringify({ fields }) });
  } else {
    await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify({ fields }) });
  }
}

async function subscribePageWebhook(pageId, pageAccessToken) {
  // Subscribe the page to receive messaging webhook events
  await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscribed_fields: 'messages,messaging_postbacks',
      access_token: pageAccessToken,
    }),
  });
}
