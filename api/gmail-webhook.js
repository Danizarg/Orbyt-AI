// api/gmail-webhook.js
// Called by Gmail push notifications when a new email arrives.
// Reads the email, generates an AI reply via Groq, optionally auto-sends it.
//
// HOW IT WORKS:
// Gmail → Pub/Sub notification → this endpoint → Groq AI → draft reply in Gmail
//
// SETUP:
// 1. In Google Cloud → Pub/Sub → Create topic: "orbyt-ai-gmail"
// 2. Create subscription → Push → URL: https://yourapp.vercel.app/api/gmail-webhook
// 3. In Gmail API → Watch → subscribe your client's inbox to the topic

const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    // Decode Pub/Sub message
    const message = req.body?.message;
    if (!message?.data) return res.status(200).end(); // acknowledge silently

    const decoded = JSON.parse(Buffer.from(message.data, 'base64').toString());
    const { emailAddress, historyId } = decoded;

    // TODO: look up this email address in your DB to get their stored OAuth tokens
    // const tokens = await getTokensFromAirtable(emailAddress);
    // oauth2Client.setCredentials(tokens);

    // For now, use env var tokens (single client setup)
    oauth2Client.setCredentials({
      access_token: process.env.GMAIL_ACCESS_TOKEN,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Get the latest message
    const history = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: historyId,
      historyTypes: ['messageAdded'],
    });

    const messages = history.data?.history?.[0]?.messagesAdded || [];
    if (!messages.length) return res.status(200).end();

    for (const { message: msg } of messages) {
      const full = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });

      const headers = full.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
      const from    = headers.find(h => h.name === 'From')?.value || '';
      const body    = extractBody(full.data.payload);

      if (!body || from.includes('noreply') || from.includes('no-reply')) continue;

      // Generate AI reply
      const aiReply = await generateReply(body, subject);

      // Create draft in Gmail (does NOT auto-send — client reviews first)
      const draftBody = buildEmail(from, subject, aiReply);
      await gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw: Buffer.from(draftBody).toString('base64url'),
            threadId: msg.threadId,
          },
        },
      });

      console.log(`Draft created for email from ${from}`);
    }

    return res.status(200).end();
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).end(); // always 200 to acknowledge Pub/Sub
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function extractBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  for (const part of payload.parts || []) {
    const text = extractBody(part);
    if (text) return text;
  }
  return '';
}

async function generateReply(emailBody, subject) {
  const prompt = `You are a helpful AI assistant for a small local business. 
A customer sent this email with subject "${subject}":

"${emailBody.slice(0, 800)}"

Write a professional, warm, helpful reply. Keep it concise. Sign off as "The Team".
Write only the reply body text, no subject line.`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
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
  return [
    `To: ${to}`,
    `Subject: ${replySubject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');
}
