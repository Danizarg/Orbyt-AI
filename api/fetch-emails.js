// api/fetch-emails.js
// Fetches real Gmail inbox messages using stored OAuth tokens.
// Called by the dashboard when Inbox or Email section loads.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });

  const tokenRecord = await getGmailTokens(email);
  if (!tokenRecord) return res.json({ emails: [] });

  try {
    const accessToken = await getValidAccessToken(tokenRecord);

    // List recent inbox messages
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=15',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listRes.json();
    if (!listData.messages?.length) return res.json({ emails: [] });

    // Fetch metadata for each message in parallel
    const emails = await Promise.all(
      listData.messages.slice(0, 12).map(({ id }) =>
        fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        .then(r => r.json())
        .then(msg => {
          const headers = msg.payload?.headers || [];
          const from    = headers.find(h => h.name === 'From')?.value || '';
          const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
          const date    = headers.find(h => h.name === 'Date')?.value || '';
          const nameMatch = from.match(/^"?([^"<]+)"?\s*<?/);
          const name = (nameMatch?.[1] || from).trim().replace(/"/g, '');
          return {
            id,
            threadId: msg.threadId,
            name,
            from,
            subject,
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
    return res.json({ emails: [] });
  }
};

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
  const newTokens = await refreshRes.json();
  if (newTokens.error) throw new Error('Token refresh failed');
  return newTokens.access_token;
}
