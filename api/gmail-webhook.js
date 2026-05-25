// api/gmail-webhook.js
// Receives Gmail Pub/Sub push notifications when new emails arrive.
// Looks up stored OAuth tokens, fetches the email, drafts an AI reply in Gmail.
//
// Setup: Google Cloud → Pub/Sub → create topic → push subscription → URL: https://orbytai.org/api/gmail-webhook
// Then set GMAIL_PUBSUB_TOPIC env var and the connect-gmail flow will auto-subscribe each client.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const message = req.body?.message;
    if (!message?.data) return res.status(200).end(); // acknowledge silently

    const decoded = JSON.parse(Buffer.from(message.data, 'base64').toString());
    const { emailAddress, historyId } = decoded;

    // Look up stored tokens for this Gmail address
    const tokenRecord = await getGmailTokens(emailAddress);
    if (!tokenRecord) {
      console.log(`No tokens found for ${emailAddress}`);
      return res.status(200).end();
    }

    const accessToken = await getValidAccessToken(tokenRecord);

    // Fetch new messages from Gmail history
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

      // Save as Gmail draft (client reviews before sending)
      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
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
    return res.status(200).end(); // always 200 so Pub/Sub doesn't retry indefinitely
  }
};

function escAirtable(val) { return (val || '').replace(/"/g, '\\"'); }

async function getGmailTokens(gmailAddress) {
  const res = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/GmailTokens?filterByFormula={GmailAddress}="${escAirtable(gmailAddress)}"`,
    { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
  );
  const data = await res.json();
  return data.records?.[0]?.fields || null;
}

async function getValidAccessToken(record) {
  const expiresAt = new Date(record.ExpiresAt).getTime();
  if (Date.now() < expiresAt - 5 * 60 * 1000) return record.AccessToken;

  // Token expired — refresh it
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

  // Update access token in Airtable
  const searchRes = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/GmailTokens?filterByFormula={GmailAddress}="${escAirtable(record.GmailAddress)}"`,
    { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
  );
  const searchData = await searchRes.json();
  const existing = searchData.records?.[0];
  if (existing) {
    await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/GmailTokens/${existing.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
        },
        body: JSON.stringify({
          fields: {
            AccessToken: newTokens.access_token,
            ExpiresAt: new Date(Date.now() + (newTokens.expires_in || 3600) * 1000).toISOString(),
          },
        }),
      }
    );
  }

  return newTokens.access_token;
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  for (const part of payload.parts || []) {
    const text = extractBody(part);
    if (text) return text;
  }
  return '';
}

async function generateReply(emailBody, subject, businessContext) {
  const ctx = businessContext ? `Business context: ${businessContext}. ` : '';
  const prompt = `You are a helpful AI assistant for a small local business. ${ctx}A customer sent this email with subject "${subject}":

"${emailBody.slice(0, 800)}"

Write a professional, warm, helpful reply. Keep it concise. Sign off as "The Team".
Write only the reply body text, no subject line.`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'Thank you for your message. We will get back to you shortly.';
}

function buildEmail(to, subject, body) {
  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
  return [`To: ${to}`, `Subject: ${replySubject}`, 'Content-Type: text/plain; charset=utf-8', '', body].join('\r\n');
}
