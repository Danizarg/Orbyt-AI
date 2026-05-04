// api/airtable.js — Database layer using Airtable (free tier)

const BASE_URL = 'https://api.airtable.com/v0';

function headers() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
  };
}

async function getClient(slug) {
  const url = `${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Clients?filterByFormula={Slug}="${slug}"`;
  const res = await fetch(url, { headers: headers() });
  const data = await res.json();
  return data.records?.[0]?.fields || null;
}

async function getAllClients() {
  const url = `${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Clients`;
  const res = await fetch(url, { headers: headers() });
  const data = await res.json();
  return data.records?.map(r => ({ id: r.id, ...r.fields })) || [];
}

async function saveClientTokens(slug, gmailToken, gmailRefresh) {
  const url = `${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Clients?filterByFormula={Slug}="${slug}"`;
  const res = await fetch(url, { headers: headers() });
  const data = await res.json();
  const recordId = data.records?.[0]?.id;
  if (!recordId) return;
  await fetch(`${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Clients/${recordId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ fields: { GmailToken: gmailToken, GmailRefresh: gmailRefresh } }),
  });
}

async function logMessage({ clientSlug, name, contact, channel, message, reply, status = 'Sent' }) {
  await fetch(`${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Messages`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      fields: { ClientSlug: clientSlug, Name: name, Contact: contact, Channel: channel, Message: message, AIReply: reply, Status: status, Time: new Date().toISOString() },
    }),
  });
}

async function getMessages(clientSlug, limit = 20) {
  const url = `${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Messages?filterByFormula={ClientSlug}="${clientSlug}"&sort[0][field]=Time&sort[0][direction]=desc&maxRecords=${limit}`;
  const res = await fetch(url, { headers: headers() });
  const data = await res.json();
  return data.records?.map(r => ({ id: r.id, ...r.fields })) || [];
}

async function logBooking({ clientSlug, customerName, service, dateTime, channel }) {
  await fetch(`${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Bookings`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ fields: { ClientSlug: clientSlug, CustomerName: customerName, Service: service, DateTime: dateTime, Channel: channel, Status: 'Confirmed' } }),
  });
}

async function getBookings(clientSlug) {
  const url = `${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Bookings?filterByFormula={ClientSlug}="${clientSlug}"&sort[0][field]=DateTime&sort[0][direction]=asc`;
  const res = await fetch(url, { headers: headers() });
  const data = await res.json();
  return data.records?.map(r => ({ id: r.id, ...r.fields })) || [];
}

async function getStats(clientSlug) {
  const messages = await getMessages(clientSlug, 200);
  const bookings = await getBookings(clientSlug);
  const today = new Date().toDateString();
  const todayMsgs = messages.filter(m => new Date(m.Time).toDateString() === today);
  const byChannel = messages.reduce((acc, m) => { acc[m.Channel] = (acc[m.Channel] || 0) + 1; return acc; }, {});
  return { totalMessages: messages.length, todayMessages: todayMsgs.length, totalBookings: bookings.length, byChannel, recentMessages: messages.slice(0, 10) };
}

module.exports = { getClient, getAllClients, saveClientTokens, logMessage, getMessages, logBooking, getBookings, getStats };
