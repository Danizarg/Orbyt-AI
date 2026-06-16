// api/airtable.js — Database layer
const BASE_URL = 'https://api.airtable.com/v0';
function headers() { return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}` }; }
function esc(val) { return (val || '').replace(/"/g, '\\"'); }

async function logMessage({ clientSlug, name, contact, channel, message, reply, status = 'Sent' }) {
  if (!process.env.AIRTABLE_API_KEY) return;
  await fetch(`${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Messages`, { method: 'POST', headers: headers(), body: JSON.stringify({ fields: { ClientSlug: clientSlug, Name: name, Contact: contact, Channel: channel, Message: message, AIReply: reply, Status: status, Time: new Date().toISOString() } }) });
}

async function getMessages(clientSlug, limit = 20) {
  if (!process.env.AIRTABLE_API_KEY) return [];
  const res = await fetch(`${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Messages?filterByFormula={ClientSlug}="${esc(clientSlug)}"&sort[0][field]=Time&sort[0][direction]=desc&maxRecords=${limit}`, { headers: headers() });
  const data = await res.json();
  return data.records?.map(r => ({ id: r.id, ...r.fields })) || [];
}

// Look up which company a user belongs to, then return that company's config.
// Requires two Airtable tables: Users (Email, ClientSlug, Role) and Clients (all config fields).
async function getCompanyConfig(userEmail) {
  if (!process.env.AIRTABLE_API_KEY) return null;
  try {
    // Step 1: find the user's company slug in the Users table
    const usersRes = await fetch(
      `${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Users?filterByFormula={Email}="${esc(userEmail)}"&maxRecords=1`,
      { headers: headers() }
    );
    const usersData = await usersRes.json();
    const userRecord = usersData.records?.[0];
    if (!userRecord) return null;
    const slug = userRecord.fields.ClientSlug;
    if (!slug) return null;

    // Step 2: load the company config from the Clients table
    const clientRes = await fetch(
      `${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Clients?filterByFormula={Slug}="${esc(slug)}"&maxRecords=1`,
      { headers: headers() }
    );
    const clientData = await clientRes.json();
    const client = clientData.records?.[0];
    if (!client) return null;
    const f = client.fields;

    return {
      slug,
      companyName:      f.CompanyName || f.Name || '',
      primaryColor:     f.PrimaryColor || '',
      logo:             f.Logo || '',
      enabledChannels:  (f.EnabledChannels || 'gmail,outlook').split(',').map(s => s.trim()).filter(Boolean),
      enabledFeatures:  (f.EnabledFeatures || 'inbox,compose,connections,settings').split(',').map(s => s.trim()).filter(Boolean),
      businessContext:  f.BusinessContext || '',
      plan:             f.Plan || 'free',
      status:           f.Status || 'Active',
      stripeSubscriptionId: f.StripeSubscriptionId || '',
      language:         f.Language || 'en',
      role:             userRecord.fields.Role || 'staff',
    };
  } catch {
    return null;
  }
}

// Update a client's subscription status by their Stripe subscription ID.
async function updateClientStatus(subscriptionId, status) {
  if (!process.env.AIRTABLE_API_KEY || !subscriptionId) return;
  const BASE = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`;
  const hdrs = headers();
  // Find the client record with this subscription ID
  const searchRes = await fetch(
    `${BASE}/Clients?filterByFormula={StripeSubscriptionId}="${esc(subscriptionId)}"&maxRecords=1`,
    { headers: hdrs }
  );
  const searchData = await searchRes.json();
  const record = searchData.records?.[0];
  if (!record) return;
  // Update the Status field
  await fetch(`${BASE}/Clients/${record.id}`, {
    method: 'PATCH',
    headers: hdrs,
    body: JSON.stringify({ fields: { Status: status } }),
  });
}

module.exports = { logMessage, getMessages, getCompanyConfig, updateClientStatus };
