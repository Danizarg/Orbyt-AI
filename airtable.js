// api/airtable.js
// Central database layer using Airtable (free tier).
// All other API files import from here.
//
// SETUP (free at airtable.com):
// 1. Go to https://airtable.com → create a new Base called "Orbyt AI"
// 2. Create these tables:
//
//    Table: Clients
//    Fields: Name, Slug, BusinessContext, BusinessHours, Plan, Status
//            GmailToken, GmailRefresh, WATIPhone, CreatedAt
//
//    Table: Messages
//    Fields: ClientSlug, Name, Phone/Email, Channel, Message,
//            AIReply, Status (Sent/Draft/Pending), Time
//
//    Table: Bookings
//    Fields: ClientSlug, CustomerName, Service, DateTime, Channel, Status
//
// 3. Go to https://airtable.com/account → generate Personal Access Token
//    Scopes: data.records:read, data.records:write
//    Access: your Orbyt AI base
// 4. Get your Base ID from: https://airtable.com/appXXXXXX (the appXXX part)
// 5. Add to Vercel env vars:
//    AIRTABLE_API_KEY = your personal access token
//    AIRTABLE_BASE_ID = appXXXXXXXXXXXXXX

const BASE_URL = 'https://api.airtable.com/v0';

function headers() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
  };
}

// ─── CLIENTS ─────────────────────────────────────────────────────────────────

export async function getClient(slug) {
  const url = `${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Clients?filterByFormula={Slug}="${slug}"`;
  const res = await fetch(url, { headers: headers() });
  const data = await res.json();
  return data.records?.[0]?.fields || null;
}

export async function getAllClients() {
  const url = `${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Clients`;
  const res = await fetch(url, { headers: headers() });
  const data = await res.json();
  return data.records?.map(r => ({ id: r.id, ...r.fields })) || [];
}

export async function saveClientTokens(slug, gmailToken, gmailRefresh) {
  // First find the record
  const url = `${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Clients?filterByFormula={Slug}="${slug}"`;
  const res = await fetch(url, { headers: headers() });
  const data = await res.json();
  const recordId = data.records?.[0]?.id;
  if (!recordId) return;

  await fetch(`${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Clients/${recordId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({
      fields: {
        GmailToken: gmailToken,
        GmailRefresh: gmailRefresh,
      },
    }),
  });
}

// ─── MESSAGES ────────────────────────────────────────────────────────────────

export async function logMessage({ clientSlug, name, contact, channel, message, reply, status = 'Sent' }) {
  await fetch(`${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Messages`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      fields: {
        ClientSlug: clientSlug,
        Name: name,
        Contact: contact,
        Channel: channel,
        Message: message,
        AIReply: reply,
        Status: status,
        Time: new Date().toISOString(),
      },
    }),
  });
}

export async function getMessages(clientSlug, limit = 20) {
  const url = `${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Messages`
    + `?filterByFormula={ClientSlug}="${clientSlug}"`
    + `&sort[0][field]=Time&sort[0][direction]=desc`
    + `&maxRecords=${limit}`;
  const res = await fetch(url, { headers: headers() });
  const data = await res.json();
  return data.records?.map(r => ({ id: r.id, ...r.fields })) || [];
}

// ─── BOOKINGS ────────────────────────────────────────────────────────────────

export async function logBooking({ clientSlug, customerName, service, dateTime, channel }) {
  await fetch(`${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Bookings`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      fields: {
        ClientSlug: clientSlug,
        CustomerName: customerName,
        Service: service,
        DateTime: dateTime,
        Channel: channel,
        Status: 'Confirmed',
      },
    }),
  });
}

export async function getBookings(clientSlug) {
  const url = `${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Bookings`
    + `?filterByFormula={ClientSlug}="${clientSlug}"`
    + `&sort[0][field]=DateTime&sort[0][direction]=asc`;
  const res = await fetch(url, { headers: headers() });
  const data = await res.json();
  return data.records?.map(r => ({ id: r.id, ...r.fields })) || [];
}

// ─── STATS (for dashboard metrics) ──────────────────────────────────────────

export async function getStats(clientSlug) {
  const messages = await getMessages(clientSlug, 200);
  const bookings = await getBookings(clientSlug);

  const today = new Date().toDateString();
  const todayMsgs = messages.filter(m => new Date(m.Time).toDateString() === today);
  const todayBookings = bookings.filter(b => new Date(b.DateTime).toDateString() === today);

  const byChannel = messages.reduce((acc, m) => {
    acc[m.Channel] = (acc[m.Channel] || 0) + 1;
    return acc;
  }, {});

  return {
    totalMessages: messages.length,
    todayMessages: todayMsgs.length,
    totalBookings: bookings.length,
    todayBookings: todayBookings.length,
    byChannel,
    recentMessages: messages.slice(0, 10),
  };
}
