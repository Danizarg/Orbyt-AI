// api/checkout.js
// Creates a Stripe checkout session for a subscription plan
// Called when user clicks "Get started" on a pricing plan

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { plan, email } = req.body;
  if (!plan) return res.status(400).json({ error: 'Missing plan' });

  const PRICES = {
    base:     'price_1TUWLeEneImGPGUboXhIYYY2',
    pro:      'price_1TUWMSEneImGPGUb7hnK61Yt',
    ultimate: 'price_1TUWN6EneImGPGUbAZoAfzb7',
  };

  const priceId = PRICES[plan];
  if (!priceId) return res.status(400).json({ error: 'Invalid plan' });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'Stripe not configured' });

  const baseUrl = process.env.APP_URL || 'https://orbyt-ai-two.vercel.app';

  try {
    const body = new URLSearchParams({
      'mode': 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'success_url': `${baseUrl}/dashboard?payment=success&plan=${plan}`,
      'cancel_url': `${baseUrl}/?payment=cancelled`,
      'allow_promotion_codes': 'true',
    });

    // Pre-fill email if provided
    if (email) body.append('customer_email', email);

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Stripe error:', err);
      return res.status(502).json({ error: 'Stripe error', detail: err });
    }

    const session = await response.json();
    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
