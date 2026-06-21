# Orbyt AI — Session Context (June 21 2026)

## What This Project Is
Orbyt AI is a multi-tenant SaaS dashboard for local businesses. Businesses log in at orbytai.org and get a unified inbox for Gmail, Outlook, Instagram, WhatsApp — with AI-drafted replies via Groq. Each client gets a custom-branded dashboard. Monthly subscription via Stripe gates access.

**Stack:** Vanilla HTML/CSS/JS frontend, Vercel serverless functions (Node.js), Airtable as database, Supabase auth, Groq AI, Stripe payments.

**Repo:** github.com/Danizarg/Orbyt-AI  
**Live site:** https://orbytai.org  
**Local path:** C:\Users\husky\Documents\GitHub\Orbyt-AI  
**Working branch:** claude/orbit-ai-overview-5ulpme (needs merging to main)

---

## What Was Done This Session

### 1. Multi-tenant architecture built
- `api/airtable.js` — added `getCompanyConfig(email)` + `updateClientStatus(subscriptionId, status)`
- `api/channel-status.js` — now returns `companyConfig` alongside channel status in one API call
- `dashboard.html` — `loadChannelStatus` applies company config on login: brand color, logo, company name, hides channels not in their plan

**Airtable tables needed (NOT YET CREATED by user):**
- New table: `Users` (fields: Email, ClientSlug, Role)
- New fields on `Clients`: CompanyName, PrimaryColor, Logo, EnabledChannels, EnabledFeatures, Language

### 2. Stripe subscription gating built
- `api/webhook.js` — now handles `customer.subscription.deleted` → sets Airtable Status to `Inactive`; `customer.subscription.updated` → sets Active/Inactive based on Stripe status
- `dashboard.html` — if `companyConfig.status !== 'Active'`, shows "Subscription paused" screen with Renew button
- Admin/non-company users are never gated

**Stripe webhook events to add in Stripe Dashboard:**
- `customer.subscription.updated` ← needs adding
- `customer.subscription.deleted` ← needs adding

### 3. Demo mode added
- Visit `/dashboard?demo=caretaker` — loads a fully styled sample dashboard with no login
- Hardcoded in `DEMO_CONFIGS` object in dashboard.html
- Shows 5 realistic sample messages (Dutch names, care-related)
- Demo banner at bottom: "Demo preview — messages and data are examples"
- To add more demos: add another key to `DEMO_CONFIGS`

### 4. Terms of Service page created
- `terms.html` — full legal ToS page matching privacy.html style
- Route added to `vercel.json`: `/terms` → `/terms.html`
- URL: https://orbytai.org/terms
- Required for Google OAuth consent screen

### 5. Google OAuth verification
- Domain `orbytai.org` verified via Namecheap DNS TXT record in Google Search Console ✅
- Branding verified in Google Cloud Console ✅
- App published (Testing → Production) ✅
- Scopes to add to consent screen (not yet done): gmail.readonly, gmail.send, gmail.modify, gmail.compose, gmail.labels, calendar, calendar.events, calendar.readonly

### 6. Google Maps API key created
- Key: (stored in Vercel as GOOGLE_MAPS_API_KEY)
- Restricted to: orbytai.org/*, 5 APIs: Maps JavaScript, Directions, Distance Matrix, Geocoding, Places
- For caretaker route planning feature (to be built later)
- Added to `.env.example`

### 7. Gmail inbox bug — PARTIALLY FIXED (main issue)

**Root cause found:** The OAuth state parameter is `{uuid}:{email}` (UUID nonce for CSRF protection). The UUID was being saved as part of `UserEmail` in Airtable GmailTokens table. So all records look like:
```
UserEmail: "7ac61124-080e-4516-bd45-ea1b65b8dd1e:daniel.zarghoum@gmail.com"
```
But `channel-status.js` and `fetch-emails.js` search for exact match on plain email → find nothing → return `connected: false` → inbox never loads.

**Fix applied (on feature branch, needs verifying on main):**
- `api/connect-gmail.js` line 86: strip UUID nonce from state before saving
  ```js
  const rawState = state || '';
  const userEmail = /^[0-9a-f]{8}-[0-9a-f]{4}-.../.test(rawState) ? rawState.slice(37) : rawState;
  ```
- `api/fetch-emails.js` `getGmailTokens()`: changed to FIND formula for backward compat
  ```js
  OR({UserEmail}="${email}", FIND("${email}", {UserEmail}) > 0)
  ```
- `api/channel-status.js` `checkGmail()`: same FIND formula fix

**Status:** Fix committed to `claude/orbit-ai-overview-5ulpme` branch. User ran git merge and push to main but emails still not loading. Needs further investigation.

**Next debugging steps:**
1. Check Vercel function logs for `/api/channel-status` and `/api/fetch-emails` — look for errors
2. Check if the FIND formula Airtable query actually returns a record (test in Airtable formula tester)
3. Check if `fetch-emails.js` GET handler without `action` param actually lists emails — look at what `action` value the dashboard sends
4. Try: open Network tab in browser DevTools → reload dashboard → click on `channel-status` request → check Response — does it say `"connected": true`?
5. Try: click on `fetch-emails` request → check Response — what does it return?
6. Also check: the Airtable GmailTokens table has 11 records with `{uuid}:email` format — the latest one (row 11, ExpiresAt: 2026-06-21T11:04:52.685Z) is the most recent token

---

## Vercel Environment Variables (set in Vercel Dashboard)
- `APP_URL` = https://orbytai.org ✅
- `SUPABASE_ANON_KEY` ✅
- `SUPABASE_URL` ✅
- `AIRTABLE_API_KEY` ✅
- `AIRTABLE_BASE_ID` ✅
- `GROQ_API_KEY` ✅
- `STRIPE_SECRET_KEY` ✅
- `STRIPE_PUBLISHABLE_KEY` ✅
- `GMAIL_CLIENT_ID` ✅
- `GMAIL_CLIENT_SECRET` ✅
- `GMAIL_REDIRECT_URI` ✅
- `CACHE_BUST` ✅
- `GOOGLE_MAPS_API_KEY` ✅ (just added)
- `STRIPE_WEBHOOK_SECRET` ❌ not set
- `OUTLOOK_CLIENT_ID` ❌ not set (Azure blocked by phone number issue)
- `OUTLOOK_CLIENT_SECRET` ❌ not set
- `META_APP_ID` ❌ not set
- `META_APP_SECRET` ❌ not set
- `META_VERIFY_TOKEN` ❌ not set
- `WATI_API_URL` ❌ not set
- `WATI_API_TOKEN` ❌ not set

---

## Business Model
- €400–500 one-time setup fee per client
- €800/month maintenance subscription per client
- Each client gets: custom dashboard, custom AI context, custom channels, subscription gating
- Demo URL for prospects: `https://orbytai.org/dashboard?demo=caretaker`
- Caretaker company (first client): wants route planning for 20 homes — build this later using Google Maps APIs

---

## Files Changed This Session (on feature branch)
- `api/airtable.js` — getCompanyConfig, updateClientStatus
- `api/channel-status.js` — returns companyConfig, FIND formula for Gmail lookup
- `api/connect-gmail.js` — strips UUID nonce from state
- `api/fetch-emails.js` — FIND formula for Gmail token lookup
- `api/webhook.js` — handles subscription deleted/updated
- `dashboard.html` — company config, subscription gating, demo mode
- `terms.html` — new file
- `vercel.json` — added /terms route
- `.env.example` — added GOOGLE_MAPS_API_KEY
- `API_SETUP.md` — new file (setup guide)
- `SETUP_TRACKER.md` — new file (checklist)
- `NEXT_STEPS.md` — new file (action plan)

---

## Immediate Next Priority
Fix the Gmail inbox. The code fix is in place — need to confirm:
1. Is the latest code deployed on Vercel (check Vercel deployments page)?
2. Does reconnecting Gmail now store clean email (no UUID prefix) in Airtable?
3. Does channel-status return `connected: true` after reconnect?
4. If yes to all — emails should load. If not, check Vercel logs for fetch-emails errors.
