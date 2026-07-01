# NAPAI Setup Guide

## 1. Install dependencies

```bash
npm install
```

## 2. Environment variables

Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

Fill in:
- `ANTHROPIC_API_KEY` — from https://console.anthropic.com/settings/keys
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — see step 3
- `RAPIDAPI_KEY` — optional, enables LinkedIn job search (see step 5)

## 3. Supabase setup

### Step A — Create project

1. Go to https://supabase.com and create a new project
2. Copy **Project URL** and **anon public key** from **Settings → API** into `.env.local`

### Step B — Run migrations

In the Supabase dashboard go to **SQL Editor**, paste and run the contents of the following files in order:

1. `supabase/migrations/001_initial.sql` (Creates base tables and buckets)
2. `supabase/migrations/002_add_usage_cost.sql` (Adds usage & cost columns)
3. `supabase/migrations/003_add_master_letter_template.sql` (Adds master letter template column)

These migrations set up the `profiles`, `cvs`, and `applications` tables with proper fields and RLS, as well as the storage bucket for CVs.

### Step C — Configure Google OAuth

1. In the Supabase dashboard go to **Authentication → Providers → Google**
2. Enable Google provider
3. Go to https://console.cloud.google.com
   - Create/select a project
   - Enable **Google+ API** (for user info) in **APIs & Services → Library**
   - Go to **APIs & Services → OAuth consent screen** → External → fill in app details
   - Go to **Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Add Authorized redirect URI: `https://your-project.supabase.co/auth/v1/callback`
   - Copy **Client ID** and **Client Secret** back into Supabase Google provider settings
4. In Supabase **Authentication → URL Configuration** set:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/auth/callback`

## 4. Connect Gmail (for sending emails)

### Step A — Google Cloud Console

1. Go to https://console.cloud.google.com
2. Use the same project as above (or create one)
3. Go to **APIs & Services → Library** → Enable **Gmail API**
4. Go to **APIs & Services → OAuth consent screen**
   - Add scope: `https://www.googleapis.com/auth/gmail.send`
   - Add your Gmail address as a **Test User**
5. Go to **Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Desktop app**
   - Configure these credentials in one of two ways:
     - **Option A (Recommended)**: Copy the Client ID and Client Secret, and paste them into your `.env.local` as `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET`.
     - **Option B**: Download the JSON, rename to `credentials.json`, and place it in the `data/` folder:
       ```
       data/credentials.json
       ```


### Step B — Authorize in the app

1. Start the app: `npm run dev`
2. Open http://localhost:3000 and sign in
3. Click **"Connect Gmail"** in the top-right if shown
4. Sign in with your Gmail — the app saves a token and shows **"Gmail connected"**

## 5. LinkedIn job search (optional)

NAPAI uses RapidAPI JSearch to search LinkedIn:

1. Go to https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
2. Subscribe to the **free tier** (150 requests/month)
3. Copy your RapidAPI key into `RAPIDAPI_KEY` in `.env.local`

Without this key the search still works via Indeed and Werkenbij scrapers.

## 6. Upload your CV

After signing in, go to **Profile** (top-right avatar) → **Document Vault**:
- Upload your Dutch CV (language: NL) and mark it as Primary
- Optionally upload an English CV (language: EN)

The app automatically selects the right CV per job language when generating letters and sending emails.

## 7. Run the app

```bash
npm run dev
```

Open http://localhost:3000 — you'll be redirected to sign in with Google.

## How to use

1. Click **"Add Job"** — paste a job URL or job text
2. AI pipeline runs: scrapes → extracts → scores → generates email + letter PDF
3. A review modal opens — edit the email body, download/regenerate the letter
4. Click **"Send via Gmail"** — email with CV + letter is sent to the recruiter
5. Track status in the dashboard (Pending → Sent → Interview → etc.)

## Test mode

Toggle **"Test mode"** in the header to redirect all emails to `kerrytheartist31@gmail.com` — lets you preview exactly what recruiters receive without sending to real addresses.

## LinkedIn / jobs that block scraping

For jobs that block automated access:
1. Open the job in your browser
2. Select all text (Ctrl+A) → Copy (Ctrl+C)
3. In NAPAI click **"Add Job"** → paste the text directly

## Folder structure

```
NAPAI/
├── app/                   Next.js App Router pages + API routes
│   ├── api/
│   │   ├── process-job/   AI pipeline (scrape → extract → score → generate)
│   │   ├── applications/  CRUD for tracking table (Supabase)
│   │   ├── send-email/    Gmail send with CV + letter attachments
│   │   ├── upload-cv/     CV upload/delete + profile/template management
│   │   ├── regenerate-letter/ Re-generate or edit letter via AI
│   │   ├── search-jobs/   Job search (Indeed + Werkenbij + LinkedIn JSearch)
│   │   └── auth/          Gmail OAuth connect + callback
│   ├── login/             Google sign-in page
│   ├── profile/           Document Vault + Master Email Template
│   └── auth/callback/     Supabase OAuth callback
├── components/            UI components (table, modals, search panel)
├── lib/                   Core logic (AI, Gmail, scraper, PDF, storage, Supabase)
├── types/                 TypeScript types
├── supabase/migrations/   SQL migration for Supabase setup
├── data/                  Gmail credentials + token (local only, gitignored)
└── public/cv/             Optional fallback CV location
```
