// api/_auth.js — Shared auth verification for API routes
// Verifies Supabase JWT and returns the authenticated user's email.
// Files prefixed with _ are not exposed as Vercel endpoints.

const SUPABASE_URL = 'https://stlfcpodwgwpqcpwodsr.supabase.co';

async function verifyAuth(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  if (!token || token.length < 10) return null;
  try {
    const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: {
        Authorization: 'Bearer ' + token,
        apikey: process.env.SUPABASE_ANON_KEY || '',
      },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user.email || null;
  } catch {
    return null;
  }
}

module.exports = { verifyAuth };
