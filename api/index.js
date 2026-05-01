// api/index.js
// Serves index.html with Supabase keys injected from environment variables.
// This keeps keys out of the static file while still being public-safe.

import { readFileSync } from 'fs';
import { join } from 'path';

export default function handler(req, res) {
  try {
    const filePath = join(process.cwd(), 'index.html');
    let html = readFileSync(filePath, 'utf-8');

    // Inject Supabase public keys (these are safe to expose in frontend)
    html = html.replace('__SUPABASE_URL__', process.env.SUPABASE_URL || '');
    html = html.replace('__SUPABASE_ANON_KEY__', process.env.SUPABASE_ANON_KEY || '');

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  } catch (err) {
    console.error('Error serving index:', err);
    res.status(500).send('Server error');
  }
}
