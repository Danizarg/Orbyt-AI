// api/webhook.js — Stripe webhook handler
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (whSecret) {
    const sig = req.headers['stripe-signature'];
    if (!sig) return res.status(400).json({ error: 'Missing signature' });
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const elements = sig.split(',').reduce((acc, part) => {
      const [k, v] = part.split('=');
      acc[k] = v;
      return acc;
    }, {});
    const timestamp = elements.t;
    const sigHash = elements.v1;
    if (!timestamp || !sigHash) return res.status(400).json({ error: 'Invalid signature format' });
    const tolerance = 300;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > tolerance) return res.status(400).json({ error: 'Timestamp outside tolerance' });
    const expected = crypto.createHmac('sha256', whSecret).update(timestamp + '.' + rawBody).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigHash))) return res.status(400).json({ error: 'Signature mismatch' });
  }

  try {
    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const planMap = {
      'price_1TUWLeEneImGPGUboXhIYYY2': 'Base',
      'price_1TUWMSEneImGPGUb7hnK61Yt': 'Pro',
      'price_1TUWN6EneImGPGUbAZoAfzb7': 'Ultimate',
    };
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const customerEmail = session.customer_details?.email;
      const subscriptionId = session.subscription;
      if (customerEmail && subscriptionId && secretKey) {
        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
          headers: { 'Authorization': `Bearer ${secretKey}` }
        });
        const sub = await subRes.json();
        const priceId = sub.items?.data?.[0]?.price?.id;
        const plan = planMap[priceId] || 'Base';
        await saveToAirtable(customerEmail, plan, subscriptionId);
      }
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error:', err.message);
    return res.status(400).json({ error: 'Webhook processing failed' });
  }
};

async function saveToAirtable(email, plan, subscriptionId) {
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) return;
  const BASE = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`;
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}` };
  await fetch(`${BASE}/Clients`, {
    method: 'POST', headers,
    body: JSON.stringify({ fields: { Name: email, Slug: email.split('@')[0], Plan: plan, Status: 'Active', StripeSubscriptionId: subscriptionId } }),
  });
}
