# PLAN.md — Orbyt AI Project

> Central memory and control document. Update at the end of every session.
> Last updated: 2026-05-23

---

## 1. General Work Plan

**Project goal:** Orbyt AI is a SaaS dashboard for local businesses that centralises customer messages from multiple channels (Gmail, Instagram DMs, WhatsApp) and lets business owners read, and reply with AI-drafted responses — all from one place.

**Stack:**
- Frontend: Vanilla HTML/CSS/JS (dashboard.html, index.html)
- Auth: Supabase (email/password + Google OAuth)
- Backend: Vercel serverless functions (CommonJS, /api/*.js)
- Database / token storage: Airtable
- AI: Groq (llama-3.3-70b-versatile) for reply drafts
- Payments: Stripe (checkout + webhook)
- Channels: Gmail (OAuth2), Instagram DMs (Meta Business API), WhatsApp (planned)

**Key constraints:**
- Vercel Hobby plan = max 12 serverless functions
- Current count: 12 functions (at limit — any new feature must merge into an existing file)
- No npm packages for API calls — pure HTTP fetch everywhere

---

## 2. Implementation by Stages

### Stage 1 — Core App Shell ✅
- Supabase auth (sign-up, login, logout)
- Dashboard layout (sidebar, inbox feed, channel panels)
- Stripe checkout + webhook (subscription gating)
- Landing page + contact page

### Stage 2 — Gmail Integration ✅
- OAuth2 flow: auth URL → code exchange → token saved to Airtable GmailTokens
- Token auto-refresh on expiry
- Inbox list: last 12 messages (metadata)
- Email body fetch + mark-as-read on click
- AI-drafted reply pre-filled in compose box
- Real email send via Gmail API (RFC 2822, threaded)
- Persistent connected state via channel-status.js

### Stage 3 — Instagram DM Integration ✅ (code done, pending Meta App Review)
- Meta OAuth flow → short-lived → long-lived user token
- Linked Facebook Page + Instagram Business account lookup
- Tokens saved to Airtable InstagramTokens
- Webhook: incoming DM → AI reply → send via Graph API
- channel-status.js updated to check Instagram

### Stage 4 — Privacy & Compliance ✅
- Full GDPR-compliant privacy policy at /privacy
- Google API Limited Use Disclosure included
- Footer links fixed (Privacy, Contact)

### Stage 5 — Real-time / Inbox Feed ⬜ (partially done)
- Email messages flow into the unified inbox on load ✅
- Click email → preview + AI draft ✅
- Auto-refresh inbox every N seconds ⬜
- Instagram DMs flow into unified inbox ⬜
- WhatsApp integration ⬜

### Stage 6 — Polish & Production ⬜
- Google OAuth app verification (requires demo video + scope justification)
- Meta App Review (for instagram_manage_messages)
- www → non-www redirect (via Vercel Dashboard domains, NOT vercel.json)
- APP_URL env var set to https://orbytai.org in Vercel ⬜
- Error states and loading spinners ⬜
- Mobile responsive tweaks ⬜
- Stats page / analytics ⬜

---

## 3. Checklist

### Infrastructure
- [x] Vercel project live at orbytai.org
- [x] Supabase auth connected
- [x] Airtable as token/data store
- [x] Stripe checkout + webhook
- [x] vercel.json routes (12 functions at limit)
- [ ] APP_URL env var = https://orbytai.org (fixes post-OAuth login screen)
- [ ] www → non-www redirect via Vercel Dashboard (not vercel.json)

### Gmail
- [x] OAuth connect flow (connect-gmail.js)
- [x] Token storage in Airtable GmailTokens
- [x] Token auto-refresh
- [x] Inbox list loads on dashboard
- [x] Email body loads on click + marks as read
- [x] AI reply draft generated (via Groq in draft.js)
- [x] Real email send via Gmail API
- [ ] User reconnects Gmail after APP_URL fix (to get correct redirect)
- [ ] Google OAuth app verification submitted

### Microsoft Outlook
- [x] Outlook OAuth flow merged into connect-gmail.js (provider=outlook param)
- [x] Token storage in Airtable OutlookTokens table
- [x] Token auto-refresh via Microsoft token endpoint
- [x] Inbox list via Microsoft Graph API
- [x] Email body fetch + mark-as-read via Graph API
- [x] Send reply via Graph API (sendMail)
- [x] Both Gmail and Outlook show in unified inbox (sorted by date)
- [ ] Airtable OutlookTokens table created (fields: UserEmail, OutlookAddress, AccessToken, RefreshToken, ExpiresAt, Scope)
- [ ] Azure App Registration created (OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, OUTLOOK_REDIRECT_URI env vars)

### Instagram
- [x] connect-instagram.js (OAuth + token storage)
- [x] instagram-webhook.js (incoming DM → AI reply)
- [x] channel-status.js checks Instagram
- [ ] Airtable InstagramTokens table created (fields: UserEmail, PageId, PageName, PageAccessToken, InstagramAccountId, InstagramUsername)
- [ ] Meta Developer App configured (App ID, Secret, redirect URI, webhook)
- [ ] Meta App Review submitted for instagram_manage_messages

### WhatsApp
- [ ] whatsapp-webhook.js exists but not wired to dashboard
- [ ] WhatsApp Business API credentials set up
- [ ] Dashboard WhatsApp section functional

### Dashboard UX
- [x] Unified inbox feed shows Gmail messages
- [x] Click email → body preview + AI draft
- [x] Send reply button sends real email
- [x] Connected state persists on refresh (channel-status.js)
- [ ] Inbox auto-refresh every 30–60s
- [ ] Instagram DMs appear in unified inbox
- [ ] Toast/error handling improvements
- [ ] Loading states (skeleton screens)

### Landing & Marketing
- [x] index.html landing page
- [x] Privacy policy at /privacy
- [x] Contact page at /contact
- [x] Footer links working
- [ ] Pricing section updated to reflect final plan
- [ ] SEO meta tags

---

## 4. Progress Percentage

**Estimated: 65%**

Core Gmail flow is fully working end-to-end (connect → read → AI draft → send). Instagram code is written but not live (pending Meta App Review). WhatsApp is a stub. The app is usable for Gmail-only businesses right now but needs polish, auto-refresh, and the Instagram/WhatsApp channels to be production-ready. Google OAuth verification is also pending.

---

## 5. Next Actions to Implement

Priority order:

1. **Fix APP_URL env var** — In Vercel Dashboard → Settings → Environment Variables, set `APP_URL` to `https://orbytai.org`. Redeploy. Then reconnect Gmail. This fixes the "shows login screen after OAuth" bug.

2. **Inbox auto-refresh** — Add `setInterval(() => loadRealEmails(userEmail), 45000)` in dashboard.html after initial load so new emails appear without manual refresh.

3. **Instagram DMs in unified inbox** — When Instagram is connected, fetch recent DMs from Graph API and merge them into the inbox feed alongside Gmail messages.

4. **Create Airtable InstagramTokens table** — Fields: UserEmail, PageId, PageName, PageAccessToken, InstagramAccountId, InstagramUsername, CreatedAt.

5. **Meta Developer App setup** — Set App ID, Secret, redirect URI (`https://orbytai.org/api/connect-instagram`), configure webhook (`https://orbytai.org/api/instagram-webhook`), submit App Review.

6. **Google OAuth verification** — Record demo video, write scope justifications, submit at console.cloud.google.com.

7. **Loading states** — Add spinner/skeleton while inbox loads to improve perceived performance.

---

## 6. Important Decisions and Solutions

| Decision / Problem | Solution |
|---|---|
| Vercel 12-function limit | Merged fetch-email-body into fetch-emails.js using `?action=body` param. Never add a new file without merging. |
| www vs non-www session loss | Supabase stores session per origin. Fixed by using `process.env.APP_URL` for absolute redirect in connect-gmail.js. APP_URL must be `https://orbytai.org`. |
| `onclick` + `JSON.stringify` breaks HTML | Double quotes in JSON break attribute parsing. Fixed permanently by using `addEventListener` with closure. |
| www redirect caused ERR_TOO_MANY_REDIRECTS | Never add redirects in vercel.json — use Vercel Dashboard → Domains instead. |
| No npm packages | All API calls are pure `fetch()`. No googleapis, axios, etc. Keeps functions lightweight. |
| Token storage | Airtable is used as a simple DB. GmailTokens and InstagramTokens tables. |
| AI drafts | Groq (llama-3.3-70b-versatile) called in draft.js. Fast and free tier is generous. |
| Email send format | RFC 2822 MIME, base64url encoded, sent to Gmail `/messages/send` with `threadId` for threading. |
| Google OAuth in Testing mode | Only added test users can connect. Must submit for verification to allow public use. |
| Meta App Review | instagram_manage_messages requires App Review before non-test users can connect Instagram. |

---

## 7. Backup Reminder

> **Before any major restructuring, refactoring, large deletion, or migration:**
> Run `git add -A && git commit -m "backup before [action]"` and/or create a ZIP of the project folder.
> The project is on GitHub — always push before risky changes.

---

## Session Log

### 2026-05-23 (Session 2)
- Created PLAN.md as central project tracking document
- Previous session completed: Gmail OAuth, Instagram OAuth code, privacy policy, real inbox loading, email body preview, AI draft, real email send
- Known pending: APP_URL env var fix, inbox auto-refresh, Instagram in inbox, Meta App Review, Google OAuth verification
