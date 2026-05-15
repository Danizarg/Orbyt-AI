// api/airtable.js — Database layer
const BASE_URL = 'https://api.airtable.com/v0';
function headers() { return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}` }; }
async function logMessage({ clientSlug, name, contact, channel, message, reply, status = 'Sent' }) {
  if (!process.env.AIRTABLE_API_KEY) return;
  await fetch(`${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Messages`, { method: 'POST', headers: headers(), body: JSON.stringify({ fields: { ClientSlug: clientSlug, Name: name, Contact: contact, Channel: channel, Message: message, AIReply: reply, Status: status, Time: new Date().toISOString() } }) });
}
async function getMessages(clientSlug, limit = 20) {
  if (!process.env.AIRTABLE_API_KEY) return [];
  const res = await fetch(`${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/Messages?filterByFormula={ClientSlug}="${clientSlug}"&sort[0][field]=Time&sort[0][direction]=desc&maxRecords=${limit}`, { headers: headers() });
  const data = await res.json();
  return data.records?.map(r => ({ id: r.id, ...r.fields })) || [];
}
module.exports = { logMessage, getMessages };
