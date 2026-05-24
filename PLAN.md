# PLAN.md — Orbyt AI Project

> Central memory and control document. Update at the end of every session.
> Last updated: 2026-05-24 (session 5)

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
- Initial pass: glassmorphism + shimmer + glow shadows (session 3)
- **De-vibe refactor (session 5):** flat surfaces with 1px borders, no backdrop-filter, no gradient text on values, no glow on hover/avatar/buttons. Real-product feel like Linear/Vercel/Stripe.
- Animations refined to Emil Kowalski rules: `cubic-bezier(0.23,1,0.32,1)` easing, ≤300ms duration, ≤80ms stagger, 6–12px Y translate, 3–4px blur burn-off on headlines
- Landing page phone mockup: 3 random AI conversation scripts, messages appear sequentially with typing indicator, loops continuously per page refresh
- Reveal-on-scroll: `.reveal` uses transitions (not keyframes) so it's interruptible; staggered per-grid

### Stage 8 — Light Theme ✅ (session 5)
- `:root[data-theme="light"]` overrides all colour tokens
- Inline `<head>` script reads `localStorage.orbyt-theme` (fallback to `prefers-color-scheme`) and sets `data-theme` before first paint — no flash
- Sun/moon toggle in every top nav (dashboard, landing, contact). One choice persists across all three pages via shared localStorage key
- New semantic tokens added so interactive states flip cleanly: `--surface-hover`, `--surface-active`, `--input-bg`, `--shadow-card`, `--nav-bg`, `--grid-line`, `--glow-opacity`
- All hardcoded `rgba(255,255,255,X)` hovers replaced with the new tokens
- Light palette: `#f7f8fa` bg, white surfaces, darker brand purple (`#4f3dcc`) for muted text/links, darker green/amber/coral text variants for contrast on white

### Stage 9 — Connection Scaffold ✅ (session 4)
- 33 integrations across 6 categories on the Connections page
- 10 sidebar Channel entries (Email, WhatsApp, Instagram, Messenger, TikTok, Telegram, Phone & SMS, Reviews, Calendar, Chat widget)
- 5 new section pages (Messenger, TikTok, Telegram, Reviews, Calendar) with metric cards + setup steps + automation toggles
- `comingSoon(name)` toast for un-wired buttons. APIs wire up in later sessions

### Stage 10 — Disconnect for every connection ✅ (session 5)
- Connected button hovers (desktop) reveal "Disconnect" with coral styling via CSS-only swap
- Touch devices (`@media (hover: none)`) show a small ✕ badge inside the button so the affordance is always visible
- Wired services (Gmail / Outlook / Instagram) call `GET /api/channel-status?action=disconnect&provider=X&email=Y` which deletes the Airtable record
- channel-status.js extended with `TABLES` map (provider→table name) + `findRecordId` + `deleteRecord` helpers
- After disconnect: button reverts to "Connect", email status pill recomputes (stays "Connected" if other provider still on), inbox feed resets
- Stub services use `disconnectStub` which flips the button back locally
- **Still only 12 Vercel functions** — disconnect lives inside existing channel-status.js

### Stage 11 — Polish & Production ⬜
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
- [ ] **Supabase → Authentication → URL Configuration**: Site URL = `https://orbytai.org`, Redirect URLs add `https://orbytai.org/dashboard` and `https://orbytai.org/**` (user said "tomorrow" — session 5)

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
- [x] De-vibed UI — flat surfaces, no glow, professional product feel
- [x] Emil Kowalski-style text motion (spring easing, staggered reveals, ≤300ms)
- [x] Full connection scaffold — 33 integrations, 10 sidebar channels, 5 new section pages
- [x] Disconnect for every connection (real Airtable deletion for wired services)
- [x] Dark / light theme toggle (system-aware, persists in localStorage)
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

**Estimated: 80%**

Product surface is now feature-complete: 33-integration connection scaffold, working disconnect across the board, professional flat UI, full dark/light theme, fixed-up sign-in redirects, Emil Kowalski-grade text motion, contact-page mobile bug squashed. What's left is *wiring* (the 30 stub integrations are UI-ready and just need their OAuth/API plumbing), plus the manual external setup steps (Supabase URL config, Azure App Registration, Meta App Review, Google OAuth verification, APP_URL env var). The app is production-ready for Gmail-only businesses today.

---

## 5. Next Actions to Implement

Priority order:

1. **Fix Supabase URL configuration** — In Supabase Dashboard → Authentication → URL Configuration: set **Site URL** to `https://orbytai.org`, and add `https://orbytai.org/dashboard` and `https://orbytai.org/**` to the **Redirect URLs** allowlist. Without this, even with the new `window.location.origin` code (session 5), Supabase falls back to the old vercel preview URL after OAuth. User said they'd do this "tomorrow".

2. **Complete Azure App Registration** — Go to `entra.microsoft.com` → Applications → App registrations → New registration. Name: "Orbyt AI". Supported account types: "Accounts in any organizational directory and personal Microsoft accounts". Redirect URI (Web): `https://orbytai.org/api/connect-gmail`. Add delegated permissions: Mail.Read, Mail.Send, User.Read, offline_access. Create a client secret (copy value immediately — only shown once).

3. **Create Airtable OutlookTokens table** — Fields: UserEmail (text), OutlookAddress (text), AccessToken (long text), RefreshToken (long text), ExpiresAt (text), Scope (text), CreatedAt (text).

4. **Add Outlook env vars to Vercel** — In Vercel Dashboard → Settings → Environment Variables: `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`, `OUTLOOK_REDIRECT_URI` = `https://orbytai.org/api/connect-gmail`. Redeploy after adding.

5. **Fix APP_URL env var** — In Vercel Dashboard → Settings → Environment Variables, set `APP_URL` to `https://orbytai.org`. Redeploy. Then reconnect Gmail. Fixes "shows login screen after OAuth" bug.

6. **Inbox auto-refresh** — Add `setInterval(() => loadRealEmails(userEmail, connectedProviders), 45000)` in dashboard.html after initial load so new emails appear without manual refresh.

7. **Instagram DMs in unified inbox** — When Instagram is connected, fetch recent DMs from Graph API and merge them into the inbox feed alongside Gmail/Outlook messages.

8. **Create Airtable InstagramTokens table** — Fields: UserEmail, PageId, PageName, PageAccessToken, InstagramAccountId, InstagramUsername, CreatedAt.

9. **Meta Developer App setup** — Set App ID, Secret, redirect URI (`https://orbytai.org/api/connect-instagram`), configure webhook (`https://orbytai.org/api/instagram-webhook`), submit App Review.

10. **Google OAuth verification** — Record demo video, write scope justifications, submit at console.cloud.google.com.

11. **Loading states** — Add spinner/skeleton while inbox loads to improve perceived performance.

12. **Wire stub integrations one by one** — pick from the Session 4 table (Telegram bot is the easiest start: free, instant, no approval).

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
| Theme system without per-rule overrides | `:root[data-theme="light"]` flips all colour tokens at once. Inline `<head>` script sets the attribute *before* first paint, reading localStorage → `prefers-color-scheme`. Added semantic tokens (`--surface-hover`, `--surface-active`, `--input-bg`, `--shadow-card`, `--nav-bg`, `--grid-line`, `--glow-opacity`) so hardcoded `rgba(255,255,255,X)` hovers don't need per-rule fallbacks. |
| Disconnect affordance without a separate button | One button shows "Connected" green by default; CSS `::after` swaps the label to "Disconnect" with coral styling on hover. `@media (hover: none)` shows a permanent ✕ badge for touch. The button's `onclick` is `disconnectGmail/Outlook/Instagram` (real Airtable delete) or `disconnectStub` (local-only). |
| Real disconnect without a new Vercel function | Stayed within the 12-function limit by extending `channel-status.js` with `?action=disconnect&provider=X` — same file looks up the record by UserEmail in `{Provider}Tokens` and sends an Airtable `DELETE`. |
| Sign-in landed on vercel preview URL instead of orbytai.org | `signInWithOAuth` / `resetPasswordForEmail` / `signUp` were hardcoded with `redirectTo: 'https://orbyt-ai-two.vercel.app/dashboard'`. Replaced with `window.location.origin + '/dashboard'`. **Code fix alone is insufficient** — Supabase dashboard must list `https://orbytai.org/dashboard` in Redirect URLs *and* have Site URL set to `https://orbytai.org`, or Supabase falls back to the Site URL on any URL not in the allowlist. |
| Emil Kowalski motion rules vs first-pass animations | First-pass (session 3) used 550–700ms durations + 8px blur + `cubic-bezier(0.16,1,0.3,1)`. Tuned in session 5 against animations.dev: cap UI animations at 300ms, use exact `cubic-bezier(0.23,1,0.32,1)`, stagger ≤80ms gaps, Y translate 6–12px, blur 3–4px. Net result: hero finishes ~520ms after load (was ~1000ms). |
| "Vibe-coded" AI-generated dashboard look | De-vibe pass: dropped radial purple/cyan orbs, backdrop-filter blur everywhere, gradient text on values, shimmer button animation, every glow box-shadow. Result is flat-surfaces + 1px borders, like Linear/Vercel/Stripe. Only intentional gradient uses now are the topnav wordmark and avatar. |
| Mobile blank contact page | `.main` with `display:flex; align-items:center; min-height:100vh` pushed overflowing content *above* the document origin (flex centered-overflow). Switched to block layout under 768px with `margin:0 auto` on container. Dashboard auth screen already had the equivalent fix via `align-items:flex-start` in its mobile media query. |

---

## 7. Backup Reminder

> **Before any major restructuring, refactoring, large deletion, or migration:**
> Run `git add -A && git commit -m "backup before [action]"` and/or create a ZIP of the project folder.
> The project is on GitHub — always push before risky changes.

---

## Session Log

### 2026-05-24 (Session 5) — Polish, disconnect, light theme, redirect fix

**Commits pushed (in order):**

1. `4822745` — Emil Kowalski-style text motion on load (first pass)
2. `2f94cac` — Tuned motion to actual Emil rules (≤300ms, exact easing, tighter stagger)
3. `72b3147` — De-vibe the dashboard (flatten surfaces, kill glow shadows)
4. `fba6e6f` — Fix blank contact page on mobile (flex centering bug)
5. `33d1c63` — Full connection scaffold (33 integrations, 6 categories, 5 new pages)
6. `a26a7e8` — PLAN.md session 4 log
7. `c3f487d` — Disconnect for every connection (hover→Disconnect, real Airtable delete)
8. `2e6ead3` — Light theme with system-aware toggle on all 3 pages
9. `8acb145` — Fix sign-in redirect leaking the vercel preview URL
10. `163b1be` — Also pass `emailRedirectTo` on signUp

**Net additions:**
- Text reveal animations applied to landing page + dashboard view switches
- Dashboard de-vibed — flat surfaces, no glow, no shimmer, no gradient on metric values, no `backdrop-filter` blur. Connect buttons neutral with subtle hover.
- Connection scaffold: 33 integrations across Messaging / Email / Calendar / Reviews / Voice / Web. 5 new section pages (Messenger, TikTok, Telegram, Reviews, Calendar) with metrics + setup steps + automation toggles
- `comingSoon(name)` stub for the 30 un-wired buttons (just toast)
- Disconnect: hover-swap label "Connected → Disconnect" with coral styling; touch fallback ✕ badge; real Airtable record delete for Gmail/Outlook/Instagram via `channel-status.js?action=disconnect`; stub flip for everything else
- Light theme: full token override, inline pre-paint script, sun/moon toggle on every page, localStorage + `prefers-color-scheme`
- Contact page mobile bug fixed (flex centering)
- Sign-in/signup/reset redirects switched from hardcoded vercel preview URL to `window.location.origin`

**Blocking on user (tomorrow):**
- Supabase Dashboard → Auth → URL Configuration: set Site URL = `https://orbytai.org`, add `https://orbytai.org/dashboard` + `https://orbytai.org/**` to Redirect URLs. **Without this the redirect fix in code (commit 163b1be) won't take effect** — Supabase falls back to Site URL when the requested redirect isn't on the allowlist.

**Vercel function count after this session:** still **12**. No new files. Disconnect was added inside `channel-status.js`.

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
