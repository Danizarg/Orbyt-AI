# Orbyt AI — Complete API Setup Guide

## Quick Summary
All 9 integrations below. Setup time: **2–3 hours**. Priority order: **CRITICAL first, then OPTIONAL**.

---

## 1. SUPABASE (Authentication) — CRITICAL
**Status:** Needed for auth enforcement on server side.
**Time:** 5 min

### Steps:
1. Go to https://supabase.com → Sign in
2. Select your Orbyt AI project
3. Settings → API
4. Copy the **anon key** (public, safe to expose)
5. Set in Vercel: `SUPABASE_ANON_KEY=sk_anon_...`

**Test:** After setting, try to sign up. Check that JWT validation happens on server side (look at `/api/_auth.js` response headers).

---

## 2. AIRTABLE (Database) — CRITICAL
**Status:** Already configured in code. Just need credentials.
**Time:** 5 min

### Steps:
1. Go to https://airtable.com/create/tokens
2. Create personal access token with scopes: `data.records:read`, `data.records:write`, `schema.bases:read`
3. Copy token
4. Get Base ID from your Airtable workspace URL: `https://airtable.com/app[BASE_ID]/tbl...`
5. Set in Vercel:
   ```
   AIRTABLE_API_KEY=pat_...
   AIRTABLE_BASE_ID=app...
   ```

### Required tables in Airtable:
- ✅ `Clients` (exists)
- ✅ `Messages` (exists)
- ✅ `GmailTokens` (exists)
- ⬜ `OutlookTokens` — **CREATE THIS:**
  - UserEmail (text)
  - OutlookAddress (text)
  - AccessToken (long text)
  - RefreshToken (long text)
  - ExpiresAt (number, unix timestamp)
  - Scope (text)
- ✅ `InstagramTokens` (exists)
- ✅ `Bookings` (exists, not yet used)

**Test:** Run a query in dashboard.html console:
```js
const res = await fetch('/api/stats');
const data = await res.json();
console.log(data); // Should show message count from Airtable
```

---

## 3. GROQ (AI Reply Generation) — CRITICAL
**Status:** API endpoints ready. Just need API key.
**Time:** 2 min

### Steps:
1. Go to https://console.groq.com
2. Sign in (or create account — free tier)
3. API Keys → Create New API Key
4. Copy key
5. Set in Vercel: `GROQ_API_KEY=gsk_...`

**Test:** Send an email via Gmail connection. The `/api/draft.js` function will call Groq and generate a reply in the compose box.

---

## 4. GMAIL OAUTH — CRITICAL (Already Works)
**Status:** Code 100% complete. Needs Google Cloud credentials.
**Time:** 15 min

### Steps:
1. Go to https://console.cloud.google.com
2. Create new project (or use existing): "Orbyt AI"
3. Enable APIs:
   - Gmail API
   - Google Pub/Sub API (optional, for push notifications)
4. Create OAuth 2.0 credentials:
   - Type: Web Application
   - Authorized redirect URIs: `https://orbytai.org/api/connect-gmail`
5. Download JSON → copy `client_id` and `client_secret`
6. Set in Vercel:
   ```
   GMAIL_CLIENT_ID=...
   GMAIL_CLIENT_SECRET=...
   ```

**Test:**
1. Go to dashboard
2. Click "Connect Gmail" in Connections panel
3. Should redirect to Google consent screen → authorize
4. Should redirect back to dashboard
5. Messages from Gmail should appear in inbox

---

## 5. OUTLOOK OAUTH — CRITICAL (Code Ready, Needs Azure)
**Status:** Code 100% complete. Blocked on Azure setup.
**Time:** 15 min

### Steps:
1. Go to https://portal.azure.com → App registrations
2. New registration:
   - Name: "Orbyt AI"
   - Supported account types: "Single tenant" or "Multitenant"
3. Go to app → Certificates & Secrets
4. Create new client secret → copy `Value` (not ID)
5. Go to API permissions → Add permission:
   - Microsoft Graph → Delegated permissions:
     - `Mail.Read`
     - `Mail.Send`
     - `User.Read`
     - `offline_access`
   - Click "Grant admin consent"
6. Go to Authentication → Redirect URIs → Add:
   - `https://orbytai.org/api/connect-gmail`
7. Copy `client_id` from Overview tab
8. Set in Vercel:
   ```
   OUTLOOK_CLIENT_ID=...
   OUTLOOK_CLIENT_SECRET=...
   ```

**Also needed in Airtable:**
- Create `OutlookTokens` table (see step 2 above)

**Test:**
1. Go to dashboard → Connections → Outlook
2. Click "Connect Outlook"
3. Should redirect to Microsoft consent screen → authorize
4. Messages should appear in inbox (merged with Gmail)
5. Send a reply — should use Microsoft Graph API

---

## 6. INSTAGRAM / META OAUTH — OPTIONAL (Code Ready, Meta Review Pending)
**Status:** Code 100% complete. Blocked on Meta app review.
**Time:** 30 min (setup) + days (app review)

### Steps:
1. Go to https://developers.facebook.com
2. Create app (if not exists):
   - App type: "Business"
   - Display Name: "Orbyt AI"
   - Contact email: daniel.zarghoum@gmail.com
3. Go to Settings → Basic → copy `App ID` and `App Secret`
4. Add product: Instagram → Instagram Graph API
5. Go to Settings → Basic → Redirect URI Whitelist:
   - Add: `https://orbytai.org/api/connect-instagram`
6. Test Users → Create test user → accept invitation (check email)
7. Set in Vercel:
   ```
   META_APP_ID=...
   META_APP_SECRET=...
   META_VERIFY_TOKEN=your_random_string_here
   ```
8. Configure webhook:
   - Products → Instagram → Webhooks → Edit → Callback URL: `https://orbytai.org/api/instagram-webhook`
   - Verify Token: (same as META_VERIFY_TOKEN)
   - Subscribe to events: `messages`

### App Review:
1. Go to App Roles → Roles → Assign Meta app roles to your business account
2. Submit App Review:
   - Requested permissions: `instagram_manage_messages`
   - Use case: "Unified inbox for business messaging"
   - Screenshots: dashboard showing Instagram DM feature
3. **Wait for approval** (typically 5–7 business days)

**Test (in sandbox mode, before app review):**
1. Send yourself an Instagram DM (use test user account)
2. Go to dashboard → Connections → Instagram
3. Should show connected ✓
4. Check inbox — DM should appear
5. Reply to DM — should send via Instagram Graph API

---

## 7. STRIPE (Payments) — IMPORTANT
**Status:** Checkout sessions created. Webhook signature not verified yet.
**Time:** 10 min

### Steps:
1. Go to https://stripe.com → Dashboard
2. Go to Developers → API keys → copy `Secret key` (live or test)
3. Set in Vercel: `STRIPE_SECRET_KEY=sk_...`
4. Go to Developers → Webhooks → Add endpoint:
   - URL: `https://orbytai.org/api/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
5. After creating, view webhook details and copy `Signing secret` (whsec_...)
6. Set in Vercel: `STRIPE_WEBHOOK_SECRET=whsec_...`

**Test:**
1. Go to dashboard → Connections → any pricing tier
2. Click "Upgrade" or "Subscribe"
3. Stripe checkout should open
4. Test card: `4242 4242 4242 4242` / `12/25` / `123`
5. Complete payment
6. Should redirect to dashboard (webhook saves subscription to Airtable)
7. Verify in Airtable `Clients` table: `StripeSubscriptionId` should be set

---

## 8. WATI / WhatsApp — OPTIONAL (But Integrated)
**Status:** Webhook endpoint ready. Just needs WATI credentials.
**Time:** 10 min setup + 24hr activation

### Steps:
1. Go to https://wati.io → Sign up (free tier available)
2. Go to Settings → API & Webhooks
3. Copy `API URL` and `API Token`
4. Set in Vercel:
   ```
   WATI_API_URL=https://live-server-XXXXX.wati.io
   WATI_API_TOKEN=...
   ```
5. Configure webhook:
   - Webhook URL: `https://orbytai.org/api/whatsapp-webhook`
   - Events: Message received
   - Save

**Test:**
1. Connect your WhatsApp Business number to WATI
2. Send a message to your WhatsApp
3. Check Airtable `Messages` table — should log with channel: "WhatsApp"
4. Go to dashboard Compose → should generate AI reply
5. Send — should deliver via WATI API

---

## 9. APP_URL & VERCEL CONFIG — CRITICAL
**Status:** Template ready. Just needs setting in Vercel.
**Time:** 2 min

### Steps:
1. Go to Vercel Dashboard → Orbyt AI project → Settings → Environment Variables
2. Add/update:
   ```
   APP_URL=https://orbytai.org
   ```
3. This is used for:
   - CORS validation (`/api/_auth.js`)
   - OAuth redirect URIs
   - Security headers (CSP, HSTS)

**Important:** After setting this, users must reconnect Gmail to pick up the new redirect URL. Old tokens won't work until they reconnect.

---

## Setup Order (Recommended)
1. **SUPABASE** (5 min) — unlocks auth
2. **AIRTABLE** (5 min) — unlocks data storage
3. **GROQ** (2 min) — unlocks AI replies
4. **APP_URL** (2 min) — unlocks OAuth redirects
5. **GMAIL** (15 min) — test core flow
6. **STRIPE** (10 min) — test payments
7. **OUTLOOK** (15 min) — add second email provider
8. **WATI** (10 min) — add WhatsApp (optional, but easy)
9. **INSTAGRAM** (setup 30 min + review wait) — submit when ready

---

## Verification Checklist

After all setup, verify each integration:

- [ ] **Supabase**: Sign up → JWT verified on server
- [ ] **Airtable**: `/api/stats` returns message count
- [ ] **Groq**: Send email → AI reply generated in compose
- [ ] **Gmail**: Connect → inbox loads → send reply
- [ ] **Outlook**: Connect → inbox shows Outlook messages → send reply
- [ ] **Stripe**: Complete checkout → subscription saved to Airtable
- [ ] **WATI**: Receive WhatsApp → logs to Messages table (optional)
- [ ] **Instagram**: Receive DM → logs to Messages table (optional)

---

## Environment Variables Cheat Sheet

Copy this and fill in your values, then add to Vercel:

```
APP_URL=https://orbytai.org
SUPABASE_ANON_KEY=sk_anon_...
AIRTABLE_API_KEY=pat_...
AIRTABLE_BASE_ID=app...
GROQ_API_KEY=gsk_...
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
OUTLOOK_CLIENT_ID=...
OUTLOOK_CLIENT_SECRET=...
META_APP_ID=...
META_APP_SECRET=...
META_VERIFY_TOKEN=random_string_here
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
WATI_API_URL=https://live-server-XXXXX.wati.io
WATI_API_TOKEN=...
```

---

## Troubleshooting

**Gmail connect redirects to wrong URL?**
- Make sure `APP_URL` is set in Vercel AND you've redeployed.
- Users must reconnect after APP_URL change.

**Airtable table not found?**
- Check `AIRTABLE_BASE_ID` is correct (should start with `app`)
- Check table names match exactly: `Clients`, `Messages`, `GmailTokens`, etc.
- Create missing `OutlookTokens` table.

**Groq reply not generating?**
- Check `GROQ_API_KEY` is valid
- Check `/api/draft.js` in Vercel logs for errors
- Test with: `curl -X POST https://orbytai.org/api/draft -H "Content-Type: application/json" -d '{"message":"test"}'`

**OAuth redirect fails?**
- Check redirect URI exactly matches in Google/Azure/Meta settings
- Format: `https://orbytai.org/api/connect-gmail` (no trailing slash)
- Case-sensitive

**Stripe webhook not firing?**
- Check `STRIPE_WEBHOOK_SECRET` is set (not `STRIPE_SECRET_KEY`)
- Make sure endpoint URL is exactly `https://orbytai.org/api/webhook`
- Verify event types: `checkout.session.completed`

---

**Questions?** Check `/api/` folder for implementation details.
