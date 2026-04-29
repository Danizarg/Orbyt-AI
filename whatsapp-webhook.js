// api/whatsapp-webhook.js
// Receives incoming WhatsApp messages via WATI webhook,
// generates an AI reply, and sends it back automatically.
//
// SETUP (free trial at wati.io):
// 1. Sign up at https://wati.io → connect your WhatsApp Business number
// 2. In WATI dashboard → API & Webhooks → set webhook URL:
//    https://YOUR-VERCEL-URL.vercel.app/api/whatsapp-webhook
// 3. Add WATI_API_URL and WATI_API_TOKEN to Vercel env vars

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body;

    // WATI sends messages in this format
    const phone   = body?.waId || body?.from;
    const text    = body?.text || body?.message || '';
    const name    = body?.senderName || 'Customer';

    if (!phone || !text) return res.status(200).end();

    // Skip messages sent by us (avoid loops)
    if (body?.owner === true) return res.status(200).end();

    console.log(`WhatsApp from ${name} (${phone}): ${text}`);

    // Look up client context from env (per-client deployment)
    // or from Airtable in a multi-client setup
    const businessContext = process.env.BUSINESS_CONTEXT ||
      'A friendly local business. Be helpful, warm and concise.';

    // Generate AI reply
    const reply = await generateReply(text, name, businessContext);

    // Send reply via WATI
    await sendWhatsApp(phone, reply);

    // Log to Airtable (optional but recommended)
    await logToAirtable({ phone, name, message: text, reply, channel: 'whatsapp' });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    return res.status(200).end(); // always 200 so WATI doesn't retry endlessly
  }
}

// ─── GENERATE AI REPLY ───────────────────────────────────────────────────────
async function generateReply(customerMessage, customerName, businessContext) {
  const prompt = `You are a helpful AI assistant for a local business.
Business context: ${businessContext}

A customer named ${customerName} sent this WhatsApp message:
"${customerMessage}"

Reply in the same language as the customer's message.
Keep it short, warm and helpful (2-3 sentences max for WhatsApp).
Do not use markdown. Write only the reply text.`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content ||
    'Thanks for your message! We\'ll get back to you shortly.';
}

// ─── SEND VIA WATI ───────────────────────────────────────────────────────────
async function sendWhatsApp(phone, message) {
  const url = `${process.env.WATI_API_URL}/api/v1/sendSessionMessage/${phone}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.WATI_API_TOKEN}`,
    },
    body: JSON.stringify({ messageText: message }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('WATI send error:', err);
  }
}

// ─── LOG TO AIRTABLE ─────────────────────────────────────────────────────────
async function logToAirtable({ phone, name, message, reply, channel }) {
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) return;

  await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
    },
    body: JSON.stringify({
      fields: {
        Phone: phone,
        Name: name,
        Message: message,
        'AI Reply': reply,
        Channel: channel,
        Time: new Date().toISOString(),
        Status: 'Sent',
      },
    }),
  });
}
