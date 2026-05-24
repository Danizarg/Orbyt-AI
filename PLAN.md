# PLAN.md — Orbyt AI Project

> Central memory and control document. Update at the end of every session.
> Last updated: 2026-05-24 (session 4)

---

## 1. General Work Plan

**Project goal:** Orbyt AI is a SaaS dashboard for local businesses that centralises customer messages from multiple channels (Gmail, Outlook, Instagram DMs, WhatsApp) and lets business owners read, and reply with AI-drafted responses — all from one place.

**Stack:**
- Frontend: Vanilla HTML/CSS/JS (dashboard.html, index.html)
- Auth: Supabase (email/password + Google OAuth)
- Backend: Vercel serverless functions (CommonJS, /api/*.js)
- Database / token storage: Airtable
- AI: Groq (llama-3.3-70b-versatile) for reply drafts
- Payments: Stripe (checkout + webhook)
- Channels: Gmail (OAuth2), Microsoft Outlook (OAuth2 / Graph API), Instagram DMs (Meta Business API), WhatsApp (planned)

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

### Stage 5 — Microsoft Outlook Integration ✅ (code complete, Azure setup pending)
- Microsoft OAuth2 flow merged into connect-gmail.js via `?provider=outlook` param
- `state` param encodes provider: `outlook:EMAIL` vs `EMAIL` to share single redirect URI
- Token exchange via `https://login.microsoftonline.com/common/oauth2/v2.0/token`
- Profile fetch via `https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName`
- Tokens saved to Airtable OutlookTokens table (must be created manually — see checklist)
- fetch-emails.js extended with `?provider=outlook` for list, body, mark-as-read, send
- channel-status.js returns `{ gmail, outlook, instagram }` — all three in one call
- dashboard.html: connectOutlook(), setOutlookConnected(), unified inbox merges both providers sorted by date
- Each email carries `provider: 'gmail'|'outlook'` badge; send routes to correct API

### Stage 6 — Real-time / Inbox Feed ⬜ (partially done)
- Email messages flow into the unified inbox on load ✅
- Click email → preview + AI draft ✅
- Auto-refresh inbox every N seconds ⬜
- Instagram DMs flow into unified inbox ⬜
- WhatsApp integration ⬜

### Stage 7 — UI / Design Polish ✅
- Glassmorphism applied across dashboard: `backdrop-filter: blur()` on topnav, sidebar, cards, toast, auth-card
- Atmospheric background: `radial-gradient` purple/cyan orbs on `#app`, `.main` set transparent so gradient shows through
- Animated primary button: gradient shimmer via `background-size: 200% auto` + `@keyframes btn-shimmer`
- Section transitions: `fadeInUp` with spring easing `cubic-bezier(0.16, 1, 0.3, 1)`
- Card hover: subtle purple border glow + lift shadow
- Metric values: gradient text (`-webkit-background-clip: text`)
- Toast: glassy background + spring enter/exit animation
- Avatar: purple glow ring
- Landing page phone mockup: fully animated — 3 random conversation scripts, messages appear one-by-one with typing indicator, loops continuously on every page refresh

### Stage 8 — Polish & Production ⬜
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
- [x] Token storage in Airtable OutlookTokens table (code written)
- [x] Token auto-refresh via Microsoft token endpoint
- [x] Inbox list via Microsoft Graph API
- [x] Email body fetch + mark-as-read via Graph API
- [x] Send reply via Graph API (sendMail)
- [x] Both Gmail and Outlook show in unified inbox (sorted by date)
- [ ] **Airtable OutlookTokens table created** — fields: UserEmail, OutlookAddress, AccessToken, RefreshToken, ExpiresAt, Scope
- [ ] **Azure App Registration created** at entra.microsoft.com — name "Orbyt AI", supported account types = any org + personal Microsoft, redirect URI = `https://orbytai.org/api/connect-gmail`
- [ ] **Azure permissions added**: Mail.Read, Mail.Send, User.Read, offline_access (delegated)
- [ ] **Client secret created** in Azure → Certificates & Secrets
- [ ] **Vercel env vars set**: OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, OUTLOOK_REDIRECT_URI=https://orbytai.org/api/connect-gmail

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
- [x] Unified inbox feed shows Gmail + Outlook messages with provider badges
- [x] Click email → body preview + AI draft
- [x] Send reply button sends real email (routes by provider)
- [x] Connected state persists on refresh (channel-status.js)
- [x] Glassmorphism UI — glassy cards, topnav, sidebar, toast
- [x] Spring-eased section transitions and card hover effects
- [x] Shimmer animated primary button
- [ ] Inbox auto-refresh every 30–60s
- [ ] Instagram DMs appear in unified inbox
- [ ] Toast/error handling improvements
- [ ] Loading states (skeleton screens)

### Landing & Marketing
- [x] index.html landing page
- [x] Privacy policy at /privacy
- [x] Contact page at /contact
- [x] Footer links working
- [x] Phone mockup animated with live AI conversation scripts
- [ ] Pricing section updated to reflect final plan
- [ ] SEO meta tags

---

## 4. Progress Percentage

**Estimated: 72%**

Gmail is fully working end-to-end. Outlook code is complete but blocked on Azure App Registration (user needs to go to entra.microsoft.com to create the app). Instagram code is written but not live (pending Meta App Review). WhatsApp is a stub. UI has been dramatically improved with glassmorphism, spring animations, and an animated phone mockup. Google OAuth verification is pending. The app is production-ready for Gmail-only businesses right now.

---

## 5. Next Actions to Implement

Priority order:

1. **Complete Azure App Registration** — Go to `entra.microsoft.com` → Applications → App registrations → New registration. Name: "Orbyt AI". Supported account types: "Accounts in any organizational directory and personal Microsoft accounts". Redirect URI (Web): `https://orbytai.org/api/connect-gmail`. Add delegated permissions: Mail.Read, Mail.Send, User.Read, offline_access. Create a client secret (copy value immediately — only shown once).

2. **Create Airtable OutlookTokens table** — Fields: UserEmail (text), OutlookAddress (text), AccessToken (long text), RefreshToken (long text), ExpiresAt (text), Scope (text), CreatedAt (text).

3. **Add Outlook env vars to Vercel** — In Vercel Dashboard → Settings → Environment Variables: `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`, `OUTLOOK_REDIRECT_URI` = `https://orbytai.org/api/connect-gmail`. Redeploy after adding.

4. **Fix APP_URL env var** — In Vercel Dashboard → Settings → Environment Variables, set `APP_URL` to `https://orbytai.org`. Redeploy. Then reconnect Gmail. Fixes "shows login screen after OAuth" bug.

5. **Inbox auto-refresh** — Add `setInterval(() => loadRealEmails(userEmail, connectedProviders), 45000)` in dashboard.html after initial load so new emails appear without manual refresh.

6. **Instagram DMs in unified inbox** — When Instagram is connected, fetch recent DMs from Graph API and merge them into the inbox feed alongside Gmail/Outlook messages.

7. **Create Airtable InstagramTokens table** — Fields: UserEmail, PageId, PageName, PageAccessToken, InstagramAccountId, InstagramUsername, CreatedAt.

8. **Meta Developer App setup** — Set App ID, Secret, redirect URI (`https://orbytai.org/api/connect-instagram`), configure webhook (`https://orbytai.org/api/instagram-webhook`), submit App Review.

9. **Google OAuth verification** — Record demo video, write scope justifications, submit at console.cloud.google.com.

10. **Loading states** — Add spinner/skeleton while inbox loads to improve perceived performance.

---

## 6. Important Decisions and Solutions

| Decision / Problem | Solution |
|---|---|
| Vercel 12-function limit | Merged fetch-email-body into fetch-emails.js using `?action=body` param. Merged Outlook OAuth into connect-gmail.js using `?provider=outlook`. Never add a new file without merging. |
| www vs non-www session loss | Supabase stores session per origin. Fixed by using `process.env.APP_URL` for absolute redirect in connect-gmail.js. APP_URL must be `https://orbytai.org`. |
| `onclick` + `JSON.stringify` breaks HTML | Double quotes in JSON break attribute parsing. Fixed permanently by using `addEventListener` with closure. |
| www redirect caused ERR_TOO_MANY_REDIRECTS | Never add redirects in vercel.json — use Vercel Dashboard → Domains instead. |
| No npm packages | All API calls are pure `fetch()`. No googleapis, axios, etc. Keeps functions lightweight. |
| Token storage | Airtable is used as a simple DB. GmailTokens, OutlookTokens, and InstagramTokens tables. |
| AI drafts | Groq (llama-3.3-70b-versatile) called in draft.js. Fast and free tier is generous. |
| Email send format | RFC 2822 MIME, base64url encoded, sent to Gmail `/messages/send` with `threadId` for threading. Outlook uses Graph API `sendMail` with JSON body. |
| Single redirect URI for two OAuth providers | Used `state` param encoding (`outlook:EMAIL` vs `EMAIL`) so both Gmail and Outlook OAuth share `/api/connect-gmail` as redirect URI. connect-gmail.js checks `state.startsWith('outlook:')` to route correctly. |
| Glass effect with gradient background | `.main` set to `background: transparent`. `#app` gets CSS `radial-gradient` purple/cyan orbs. All glass cards use `backdrop-filter: blur()` + semi-transparent rgba. No extra HTML elements or z-index issues. |
| Animated phone without DOM flicker | Chat body starts empty, JS injects message `div` elements dynamically. Each message gets `.visible` class added via `requestAnimationFrame` for smooth CSS transition. 3 random conversation scripts chosen at page load; loops on completion. |
| Google OAuth in Testing mode | Only added test users can connect. Must submit for verification to allow public use. |
| Meta App Review | instagram_manage_messages requires App Review before non-test users can connect Instagram. |
| Azure Portal AADSTS16000 error | Personal Microsoft accounts get "interaction_required" error in Azure Portal. Use `entra.microsoft.com` instead of `portal.azure.com`. Click "Ignore" on popups and navigate via search bar. |
| Microsoft 365 Developer Program (wrong portal) | M365 Developer Program is for sandbox Office subscriptions, not app registrations. For OAuth app registration, always use entra.microsoft.com → App registrations. |

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

### 2026-05-24 (Session 4) — Full connection scaffold

**What got built (UI only, no real APIs except Gmail/Outlook/Instagram):**

- **Sidebar Channels** expanded 5 → 10 items: Email, WhatsApp, Instagram,
  Messenger, TikTok, Telegram, Phone & SMS, Reviews, Calendar, Chat widget.
  Each has a proper SVG icon.

- **Connections page** redesigned into 6 categorised cards with 33 total
  integration rows:
  - Messaging (7): WhatsApp Cloud API, WATI, Instagram, Messenger, Telegram,
    TikTok, Twilio SMS
  - Email (8): Gmail ✅, Outlook ✅, Yahoo, iCloud, ProtonMail, Zoho,
    Fastmail, Custom IMAP/SMTP
  - Calendar & Booking (7): Google Cal, Outlook Cal, iCloud Cal, Calendly,
    Cal.com, Acuity, Square Appointments
  - Reviews & Reputation (5): Google Business Profile, Yelp, Tripadvisor,
    Trustpilot, Facebook Reviews
  - Voice & Phone (4): Twilio Voice, Vapi, Bland.ai, Vonage
  - Website (2): Orbyt chat widget, contact form forwarding

- **5 new section pages** built with full layouts:
  - section-messenger, section-tiktok, section-telegram
  - section-reviews (incl. metric cards + automation rules)
  - section-calendar (incl. booking rules: appointment length, buffer,
    deposit, reminder cadence)

- **JS:** added `comingSoon(name)` — every un-wired button calls this
  and shows a toast. The function is exported via window.

- **Contact page** mobile bug fixed (flex centering pushed overflowing
  content above viewport — now block layout under 768px).

**Status of each integration:**

| Channel | Code | API setup | Notes |
| --- | --- | --- | --- |
| Gmail | ✅ done | ✅ done | Fully working end-to-end |
| Outlook | ✅ done | ⬜ Azure App Registration pending | UI live, OAuth waits for env vars |
| Instagram | ✅ done | ⬜ Meta App Review pending | Code complete |
| WhatsApp Cloud API | UI only | ⬜ | Pick this OR WATI in API session |
| WATI | UI only | ⬜ | Simpler, no Meta verification |
| Messenger | UI only | ⬜ | Shares Meta app with Instagram |
| Telegram | UI only | ⬜ | Bot API is free, instant |
| TikTok | UI only | ⬜ | Needs TikTok Business API approval |
| Twilio SMS/Voice | UI only | ⬜ | Account + phone number |
| Yahoo Mail | UI only | ⬜ | OAuth2 via developer.yahoo.com |
| iCloud Mail | UI only | ⬜ | App-specific password (IMAP) |
| ProtonMail | UI only | ⬜ | Proton Bridge required |
| Zoho Mail | UI only | ⬜ | OAuth2 |
| Fastmail | UI only | ⬜ | App password (JMAP/IMAP) |
| Custom IMAP/SMTP | UI only | ⬜ | Generic form: host, port, user, pass |
| Google Calendar | UI only | ⬜ | Same OAuth scope as Gmail — easy add |
| Outlook Calendar | UI only | ⬜ | Same OAuth as Outlook Mail |
| Calendly / Cal.com / Acuity / Square | UI only | ⬜ | Each has its own OAuth |
| Google Business Profile | UI only | ⬜ | OAuth + business verification |
| Yelp / Tripadvisor / Trustpilot | UI only | ⬜ | Most need partner approval |
| Vapi / Bland.ai / Vonage | UI only | ⬜ | API keys, no OAuth |

**Vercel function count after this session:** still 12 (no new files added —
all stubs are pure UI + `comingSoon()` toast). When wiring real APIs we will
merge into existing files (e.g. fetch-emails.js takes more `?provider=` values).

### 2026-05-24 (Session 3)
- **Microsoft Outlook OAuth**: Full implementation merged into connect-gmail.js (provider=outlook param), fetch-emails.js (list/body/send), channel-status.js (checkOutlook). All code deployed and pushed to GitHub.
- **Unified inbox**: dashboard.html now fetches from all connected providers in parallel, merges sorted by date, shows Gmail/Outlook provider badge per message. Send reply routes to correct API by provider.
- **UI/Design overhaul**: Applied glassmorphism to entire dashboard — glassy cards, topnav, sidebar, toast. Added atmospheric radial-gradient background on #app. Spring-eased section transitions (cubic-bezier(0.16,1,0.3,1)). Shimmer animated primary button. Card hover glow. Gradient metric values. Full commit pushed.
- **Animated phone mockup**: index.html phone chat rebuilt — 3 random AI conversation scripts, messages appear sequentially with typing indicator animation, loops continuously. Each page refresh picks a different conversation.
- **Azure setup blocked**: User tried creating Azure App Registration but encountered AADSTS16000 errors in portal.azure.com. Advised to use entra.microsoft.com. User accidentally joined Microsoft 365 Developer Program (wrong tool). Azure App Registration still pending.
- **Pending manual steps**: OutlookTokens Airtable table, Azure App Registration at entra.microsoft.com, Vercel OUTLOOK_* env vars, APP_URL env var.
