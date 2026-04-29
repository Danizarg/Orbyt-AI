# Orbyt AI — AI Assistant for Local Business
## Full setup guide — free stack, real connections

---

## File structure

```
orbyt-ai/
├── public/
│   └── index.html              ← Full dashboard UI
├── api/
│   ├── draft.js                ← AI reply generation (Groq)
│   ├── stats.js                ← Live stats from Airtable
│   ├── airtable.js             ← Database layer (all reads/writes)
│   ├── connect-gmail.js        ← Gmail OAuth connection flow
│   ├── gmail-webhook.js        ← Reads new emails, drafts AI replies
│   └── whatsapp-webhook.js     ← Receives WhatsApp, sends AI replies
├── vercel.json                 ← Routing config
└── README.md
```

---

## STEP 1 — Upload to GitHub & deploy to Vercel

1. Go to github.com → New repository → name it `orbyt-ai`
2. Upload all files (drag and drop)
3. Go to vercel.com → Add New Project → Import from GitHub → select `orbyt-ai`
4. Before clicking Deploy → add Environment Variables (see Step 2)
5. Deploy → your app is live at `https://orbyt-ai-xxx.vercel.app`

---

## STEP 2 — Environment variables (add in Vercel → Settings → Environment Variables)

| Variable | Where to get it | Required |
|---|---|---|
| `GROQ_API_KEY` | console.groq.com → free signup → API Keys | Yes |
| `AIRTABLE_API_KEY` | airtable.com/account → Personal Access Token | Yes |
| `AIRTABLE_BASE_ID` | From your Airtable base URL (appXXXXXX) | Yes |
| `GMAIL_CLIENT_ID` | Google Cloud Console → OAuth credentials | For email |
| `GMAIL_CLIENT_SECRET` | Google Cloud Console → OAuth credentials | For email |
| `GMAIL_REDIRECT_URI` | https://YOUR-APP.vercel.app/api/connect-gmail | For email |
| `WATI_API_URL` | Your WATI dashboard URL | For WhatsApp |
| `WATI_API_TOKEN` | WATI dashboard → API and Webhooks | For WhatsApp |
| `BUSINESS_CONTEXT` | Plain text description of the business for the AI | Optional |

---

## STEP 3 — Set up Airtable (free database)

1. Go to airtable.com → sign up free → Create Base → name it Orbyt AI
2. Create table: Clients
   Fields: Name, Slug, BusinessContext, BusinessHours, Plan, Status, GmailToken, GmailRefresh, WATIPhone
3. Create table: Messages
   Fields: ClientSlug, Name, Contact, Channel, Message, AIReply, Status, Time
4. Create table: Bookings
   Fields: ClientSlug, CustomerName, Service, DateTime, Channel, Status
5. Get API key: airtable.com/account → Personal Access Tokens → Create
   Scopes: data.records:read + data.records:write
6. Get Base ID from your base URL: the appXXXXXXXX part

---

## STEP 4 — Connect Groq AI (free, no credit card)

1. Go to console.groq.com → sign up free
2. API Keys → Create Key → copy it
3. Add to Vercel as GROQ_API_KEY → redeploy
4. AI replies now work in the dashboard composer and inbox

---

## STEP 5 — Connect Gmail (works with any email provider)

1. Go to console.cloud.google.com → create project → Enable Gmail API
2. OAuth consent screen → External → add your email as test user
3. Credentials → Create OAuth 2.0 Client ID → Web Application
   Redirect URI: https://YOUR-APP.vercel.app/api/connect-gmail
4. Add Client ID and Secret to Vercel env vars
5. To connect a client's inbox visit:
   https://YOUR-APP.vercel.app/api/connect-gmail?action=auth&state=salon-rosa
6. Set up Gmail push notifications via Google Cloud Pub/Sub:
   Topic: orbyt-ai-gmail
   Push subscription URL: https://YOUR-APP.vercel.app/api/gmail-webhook

For non-Gmail clients: set up email forwarding to a Gmail address you control.

---

## STEP 6 — Connect WhatsApp (via WATI)

1. Go to wati.io → free trial → connect WhatsApp Business number
2. API and Webhooks → set webhook URL: https://YOUR-APP.vercel.app/api/whatsapp-webhook
3. Add WATI_API_URL and WATI_API_TOKEN to Vercel env vars
4. Add BUSINESS_CONTEXT describing the client's business
5. Send a test WhatsApp to the number → AI replies automatically

---

## STEP 7 — Connect Instagram DMs (via Zapier free tier)

1. Go to zapier.com → sign up free
2. Create Zap: Trigger = New Instagram DM → Action = Webhooks by Zapier POST
3. POST to: https://YOUR-APP.vercel.app/api/whatsapp-webhook
   Body: { "text": "{{message}}", "phone": "{{sender}}", "channel": "instagram" }

---

## STEP 8 — Per client onboarding

For each new client:
1. Add a row to Airtable Clients table with their slug (e.g. salon-rosa)
2. Fill in BusinessContext with their hours, services, prices
3. Connect their Gmail via the OAuth URL
4. Set their WhatsApp in WATI
5. Share the dashboard URL with them

---

## Cost per client

| Tool | Cost |
|---|---|
| Vercel | Free |
| Groq AI | Free |
| Airtable | Free up to 1,000 records |
| WATI | ~40 euros/mo shared across all clients |
| Gmail API | Free |
| Total | 0-40 euros/mo |

Charge 190-490 euros/mo per client. Profitable from client number 1.
