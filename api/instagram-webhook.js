// api/instagram-webhook.js
// Receives Meta webhook events for Instagram DMs.
// GET: verifies the webhook with Meta (one-time setup).
// POST: receives incoming DMs, generates AI reply via Groq, sends it back.

const GRAPH = 'https://graph.facebook.com/v18.0';

module.exports = async function handler(req, res) {
  // GET — Meta webhook verification challenge
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).end();
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body;
    if (body.object !== 'instagram') return res.status(200).end();

    for (const entry of body.entry || []) {
      const igAccountId = entry.id;

      // Look up stored tokens for this Instagram account
      const tokenRecord = await getInstagramTokens(igAccountId);
      if (!tokenRecord) {
        console.log(`No tokens found for Instagram account ${igAccountId}`);
        continue;
      }

      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;
        const text     = event.message?.text;

        // Skip echoes (our own messages) and non-text events
        if (!text || event.message?.is_echo) continue;

        const aiReply = await generateReply(text, tokenRecord.BusinessContext);

        await sendInstagramReply(tokenRecord.PageId, tokenRecord.PageAccessToken, senderId, aiReply);
        console.log(`Replied to Instagram DM from ${senderId} on account ${igAccountId}`);
      }
    }

    return res.status(200).end();
  } catch (err) {
    console.error('Instagram webhook error:', err.message);
    return res.status(200).end(); // always 200 so Meta doesn't disable the webhook
  }
};

function escAirtable(val) { return (val || '').replace(/"/g, '\\"'); }

async function getInstagramTokens(instagramAccountId) {
  const res = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/InstagramTokens?filterByFormula={InstagramAccountId}="${escAirtable(instagramAccountId)}"`,
    { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
  );
  const data = await res.json();
  return data.records?.[0]?.fields || null;
}

async function sendInstagramReply(pageId, pageAccessToken, recipientId, text) {
  const res = await fetch(`${GRAPH}/${pageId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      access_token: pageAccessToken,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Send failed: ${data.error.message}`);
  return data;
}

async function generateReply(dmText, businessContext) {
  const ctx = businessContext ? `Business context: ${businessContext}. ` : '';
  const prompt = `You are a helpful AI assistant for a small local business. ${ctx}A customer sent this Instagram DM:

"${dmText.slice(0, 500)}"

Write a friendly, concise reply (2-3 sentences max). Keep it casual and warm, like a real person. Do not use hashtags. Write only the reply text.`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'Thanks for your message! We\'ll get back to you shortly.';
}
