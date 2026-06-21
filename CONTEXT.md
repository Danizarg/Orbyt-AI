# Orbyt AI — Session Context

Pick up from here in VS Code terminal (`claude` in the project root).

---

## What this project is

**Orbyt AI** — a white-label AI customer communication platform for small local businesses.
Single-tenant per client. Live at **orbytai.org**.

Stack: static `dashboard.html` + Vercel Serverless Functions (`/api/*.js`) + Supabase Auth + Airtable as database + Groq for AI + Stripe for billing.

---

## Repo state (as of last session)

Branch: **`main`** (all recent work is merged here)

### Recent commits
```
0cdfa4a Fix Vercel Hobby plan 12-function limit
7c3e0d3 Add Route Planner section with Google Maps route optimisation
704ccf3 Fix Gmail inbox not loading emails after OAuth connect
3765518 Add session context file for VS Code continuation
746322c Fix Gmail token lookup — strip UUID nonce from state
1019610 Add GOOGLE_MAPS_API_KEY to env.example
e44dae3 Add Terms of Service page for Google OAuth verification
0023b9e Add demo mode for client previews (?demo=caretaker)
037d20a Add subscription gating via Stripe
84e063d Add multi-tenant company config system
```

---

## Architecture

```
dashboard.html          — entire frontend (single HTML file, no framework)
api/
  _auth.js              — shared JWT verify helper (not a Vercel function)
  airtable.js           — shared Airtable read/write helpers (IS a Vercel function, GET returns company config)
  channel-status.js     — GET connected channels + company config + mapsApiKey
  checkout.js           — Stripe checkout session
  connect-gmail.js      — Gmail OAuth flow (code exchange + token storage)
  connect-instagram.js  — Instagram OAuth flow
  draft.js              — AI reply drafting via Groq
  fetch-emails.js       — Fetch + cache Gmail/Outlook messages
  gmail-webhook.js      — Gmail push notification webhook
  instagram-webhook.js  — Instagram webhook
  stats.js              — Dashboard stats (message counts etc.)
  webhook.js            — WhatsApp incoming message webhook
  whatsapp-webhook.js   — WATI webhook handler
terms.html              — Terms of Service (required for Google OAuth verification)
vercel.json             — Vercel config
```

**Vercel Hobby plan limit: 12 serverless functions.** Currently at exactly 12 (`_auth.js` doesn't count). Do NOT add new files to `/api/` without removing one first — merge into an existing file instead.

---

## Multi-tenant system

Company configs live in Airtable (`CompanyConfig` table). Fields include:
- `UserEmail` — the client's login email
- `BusinessName`, `BusinessContext`, `Industry`, `Plan`
- `EnabledFeatures` — comma-separated list e.g. `inbox,compose,route`
- `PrimaryColor`, `LogoURL` — white-label branding
- `AIPersonality`, `AIGreeting`

`channel-status.js` fetches the config on login and applies it via `applyCompanyConfig()` in the frontend.

---

## Demo mode

Append `?demo=caretaker` (or `?demo=salon`) to the URL to preview as a client.

Demo configs are hardcoded in `dashboard.html` around line 1470 (`DEMO_CONFIGS` object).

The caretaker demo (`?demo=caretaker`) is the primary sales demo — a home care company visiting 20 homes daily.

---

## Route Planner (just built)

New sidebar section: **Route planner** (between Calendar and Chat widget).

How it works:
1. User enters a starting address and list of home addresses (one per line)
2. Clicks "Calculate optimal route"
3. Frontend loads Google Maps JS API (key is delivered via `channel-status` response as `mapsApiKey`)
4. Calls `google.maps.DirectionsService` with `optimizeWaypoints: true`
5. Renders the route on a map + ordered stop list with durations

Key detail: Maps API key is fetched from `channel-status` GET response (field `mapsApiKey`), stored as `window._mapsApiKey`. No separate endpoint — that would exceed the 12-function limit.

---

## Environment variables

Set in Vercel Dashboard → Project Settings → Environment Variables.

Key ones:
- `GOOGLE_MAPS_API_KEY` — restricted to `orbytai.org/*` in Google Cloud Console. Also powers the Route Planner.
- `AIRTABLE_API_KEY` + `AIRTABLE_BASE_ID` — main database
- `GROQ_API_KEY` — AI drafting
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` — billing
- `GMAIL_CLIENT_ID` + `GMAIL_CLIENT_SECRET` — Gmail OAuth
- `META_APP_ID` + `META_APP_SECRET` + `META_VERIFY_TOKEN` — Instagram

See `.env.example` for the full list.

---

## Known issues / what's next

- **Route Planner**: The Google Maps JS API key needs **Maps JavaScript API** + **Directions API** enabled in Google Cloud Console (check this if the map doesn't load).
- **Route Planner demo**: The caretaker demo doesn't auto-populate addresses yet — user has to paste them manually. Could pre-fill from Airtable `CompanyConfig`.
- **Vercel function limit**: At exactly 12. If you need a new API endpoint, consolidate first (e.g. merge `connect-gmail` + `connect-instagram` into `connect.js?provider=gmail`).
- **Gmail OAuth**: Working. Tokens stored in Airtable `GmailTokens` table.
- **Instagram**: Connected but webhook parsing may need tuning for DM threading.

---

## Useful commands

```bash
# Start local dev (Vercel CLI)
vercel dev

# Check function count (must stay ≤ 12)
ls api/ | grep -v "^_" | wc -l

# Deploy to production
git push origin main   # Vercel auto-deploys on push to main
```
