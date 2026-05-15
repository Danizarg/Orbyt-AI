// api/webhook.js — Stripe webhook handler
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const event = req.body;
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
  } catch (err) { return res.status(400).json({ error: err.message }); }
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
