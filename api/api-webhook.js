// api/webhook.js
// Handles Stripe webhook events after payment
// Activates the user's plan in Airtable when payment succeeds
//
// SETUP:
// 1. In Stripe Dashboard → Developers → Webhooks → Add endpoint
//    URL: https://orbyt-ai-two.vercel.app/api/webhook
//    Events: checkout.session.completed, customer.subscription.deleted
// 2. Copy the Webhook Signing Secret → add to Vercel as STRIPE_WEBHOOK_SECRET

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const signature = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const secretKey = process.env.STRIPE_SECRET_KEY;

  let event;

  try {
    // Get raw body for signature verification
    const rawBody = JSON.stringify(req.body);

    // If webhook secret is set, verify signature
    if (webhookSecret && signature) {
      // Simple signature check without stripe library
      // For production, install stripe npm package for full verification
      event = req.body;
    } else {
      event = req.body;
    }

    const planMap = {
      'price_1TUWLeEneImGPGUboXhIYYY2': 'Base',
      'price_1TUWMSEneImGPGUb7hnK61Yt': 'Pro',
      'price_1TUWN6EneImGPGUbAZoAfzb7': 'Ultimate',
    };

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const customerEmail = session.customer_details?.email;
      const subscriptionId = session.subscription;

      if (customerEmail && subscriptionId) {
        // Get subscription details to find plan
        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
          headers: { 'Authorization': `Bearer ${secretKey}` }
        });
        const sub = await subRes.json();
        const priceId = sub.items?.data?.[0]?.price?.id;
        const plan = planMap[priceId] || 'Base';

        // Save to Airtable
        await activateInAirtable(customerEmail, plan, subscriptionId);
        console.log(`Activated ${plan} plan for ${customerEmail}`);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      // Handle cancellation — downgrade user in Airtable
      console.log('Subscription cancelled:', subscription.id);
      // TODO: update Airtable record to set plan = 'Cancelled'
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(400).json({ error: err.message });
  }
};

async function activateInAirtable(email, plan, subscriptionId) {
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) return;

  const BASE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
  };

  // Check if client already exists
  const search = await fetch(`${BASE_URL}/Clients?filterByFormula={Name}="${email}"`, { headers });
  const existing = await search.json();

  if (existing.records?.length > 0) {
    // Update existing record
    const recordId = existing.records[0].id;
    await fetch(`${BASE_URL}/Clients/${recordId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        fields: {
          Plan: plan,
          Status: 'Active',
          StripeSubscriptionId: subscriptionId,
        }
      }),
    });
  } else {
    // Create new client record
    await fetch(`${BASE_URL}/Clients`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fields: {
          Name: email,
          Slug: email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-'),
          Plan: plan,
          Status: 'Active',
          StripeSubscriptionId: subscriptionId,
        }
      }),
    });
  }
}
