# 🤖 NAPAI (Napify AI) — Intelligent Job Application Assistant

NAPAI is a Next.js-based, self-hosted job search, tracking, and automated application platform. It uses Playwright to scrape job descriptions, Anthropic Claude to analyze role compatibility against your resume, and Google's Gmail API to send tailored job applications with PDF cover letters and resumes directly to recruiters.

---

## 🚀 Key Features

* **💼 Universal Job Tracker**: Track jobs through a clean, interactive dashboard from draft to offer.
* **🔍 Multi-Source Job Search**: Search and pull jobs from Indeed, Werkenbij, or LinkedIn (via JSearch API) in a unified panel.
* **🧠 AI Parsing & Match Scoring**: Playwright extracts job details, and Claude extracts recruiter details, scores your alignment, and identifies potential interview talking points.
* **📂 Document Vault**: Upload English and Dutch CVs. NAPAI automatically selects the correct CV language based on the job posting.
* **📝 Tailored Cover Letters & Emails**: Automatically drafts a targeted email body and generates a professional, print-ready PDF cover letter.
* **✉️ Direct Gmail Sending**: Send applications directly from the app using Google OAuth, with the custom cover letter and matching CV automatically attached.
* **🛡️ Development Test Mode**: Toggle a safety switch to redirect all outgoing emails to your own test address so you can inspect applications before sending them to real recruiters.

---

## 🛠️ Tech Stack

* **Frontend/Backend**: Next.js 16 (App Router), React 19, TypeScript
* **Styling**: Tailwind CSS v4, Vanilla CSS
* **Database & Auth**: Supabase SSR + PostgreSQL (RLS enabled)
* **Automation**: Playwright (headless browser scraping)
* **AI Engine**: Anthropic Claude SDK (Haiku for parsing/translation, Sonnet for writing)
* **Email & Integrations**: Google APIs (Gmail API v1)
* **Document Parsing**: pdf-parse, mammoth
* **PDF Engine**: pdf-lib

---

## 📋 Prerequisites

Ensure you have the following installed/created:
* **Node.js** (v18+ recommended)
* A **Supabase** account (Free tier is sufficient)
* An **Anthropic Console** API key
* A **Google Cloud Console** account (for Gmail and OAuth authentication)
* Optional: A **RapidAPI** account (for LinkedIn JSearch integration)

---

## ⚙️ Installation & Setup

Follow these steps to get NAPAI running locally:

### 1. Clone & Install Dependencies
```bash
# Install NPM packages
npm install

# Install Playwright browser binaries (required for job scraping)
npx playwright install chromium
```

### 2. Configure Environment Variables
Copy the template and fill in the values:
```bash
cp .env.local.example .env.local
```

Open `.env.local` and configure the following:
* **`ANTHROPIC_API_KEY`**: Your Anthropic Claude API key.
* **`NEXT_PUBLIC_SUPABASE_URL`** & **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**: Obtained in the next step.
* **`NEXTAUTH_URL`**: Set to `http://localhost:3000` (for local redirect verification).
* **`RAPIDAPI_KEY`**: (Optional) For LinkedIn job search.
* **`GMAIL_CLIENT_ID`** & **`GMAIL_CLIENT_SECRET`**: (Recommended) Your Google OAuth Client ID and Secret for Gmail. Setting these avoids having to place a `credentials.json` file in the `data/` directory.

### 3. Setup Supabase Database & Storage
1. Create a new project in [Supabase](https://supabase.com).
2. Go to your Supabase Project **Settings → API** and copy the **Project URL** and **anon public key** into your `.env.local`.
3. In the Supabase dashboard, go to the **SQL Editor**, open a new query, and run the SQL migrations from the [supabase/migrations/](file:///c:/Users/User/Desktop/Lubicode/Projects/NAPAI/supabase/migrations) folder in chronological order:
   1. [001_initial.sql](file:///c:/Users/User/Desktop/Lubicode/Projects/NAPAI/supabase/migrations/001_initial.sql) (Creates base tables: `profiles`, `cvs`, `applications`, and bucket storage policies)
   2. [002_add_usage_cost.sql](file:///c:/Users/User/Desktop/Lubicode/Projects/NAPAI/supabase/migrations/002_add_usage_cost.sql) (Adds columns for tracking AI usage tokens and estimated costs)
   3. [003_add_master_letter_template.sql](file:///c:/Users/User/Desktop/Lubicode/Projects/NAPAI/supabase/migrations/003_add_master_letter_template.sql) (Adds master template profile customisation)
   4. [004_add_recruiter_phone.sql](file:///c:/Users/User/Desktop/Lubicode/Projects/NAPAI/supabase/migrations/004_add_recruiter_phone.sql) (Adds tracking for recruiter phone numbers)

### 4. Enable Google Sign-In (Supabase Auth)
1. Go to the [Google Cloud Console](https://console.cloud.google.com).
2. Create/select a project, navigate to **APIs & Services → Credentials**, and create an **OAuth client ID** of type **Web application**.
3. Under **Authorized redirect URIs**, add your Supabase project callback URL:
   `https://<your-project-id>.supabase.co/auth/v1/callback`
4. Copy the Client ID and Client Secret into the Supabase dashboard under **Authentication → Providers → Google** and enable it.
5. In Supabase **Authentication → URL Configuration**, configure:
   * **Site URL**: `http://localhost:3000`
   * **Redirect URLs**: `http://localhost:3000/auth/callback`

### 5. Setup Gmail API Integration
1. In the [Google Cloud Console](https://console.cloud.google.com), ensure the **Gmail API** is enabled.
2. In the **OAuth consent screen** configurations:
   * Add the scope: `https://www.googleapis.com/auth/gmail.send`
   * Add your own Gmail address as a **Test User** (required while in testing status).
3. Under **Credentials**, create an **OAuth Client ID** of type **Desktop app**.
4. Configure these credentials in one of two ways:
   * **Option A: Environment Variables (Recommended)**: Copy the Client ID and Client Secret, and paste them into your `.env.local` as `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET`.
   * **Option B: Credentials File**: Download the credentials JSON, rename it to `credentials.json`, and place it in the `data/` folder:
     ```
     data/credentials.json
     ```

---

## 🏃 Running the Application

1. Start the Next.js development server:
   ```bash
   npm run dev
   ```
2. Open [http://localhost:3000](http://localhost:3000) in your browser.
3. You will be redirected to log in via Google.
4. If you see a **"Connect Gmail"** prompt in the top right, click it and follow the prompts to authorize the Desktop Client. This creates `data/gmail_token.json` locally.

---

## 🎯 Step-by-Step Usage Guide

### Step 1: Upload Your Resumes
Go to your **Profile** (avatar in top-right) and upload:
* A Dutch CV (Language: NL)
* An English CV (Language: EN)
* Optional: Customize your personal contact details and write a Master Email/Letter prompt.

### Step 2: Find a Vacancy
* Use the **Search Panel** to query jobs, OR
* Click **"Add Job"** in the top dashboard and paste a direct job listing URL (Indeed, Werkenbij) or paste raw text copy-pasted directly from a blocked page.

### Step 3: Run the AI Pipeline
* The scraper parses the description, extracts recruiter details, evaluates requirements, and writes an initial cover letter/email draft.
* A **Review Modal** opens where you can:
  * Adjust the extracted recruiter name, email, and phone.
  * Preview/edit the email message body.
  * Review, download, or instruct the AI to regenerate the cover letter PDF.

### Step 4: Apply & Send
* Check the **Test Mode** checkbox in the top header if you want to perform a dry run (emails will redirect to your test email).
* Click **"Send via Gmail"** to email the recruiter. The app handles attachment of your CV (in matching language) and the generated cover letter PDF.
* Track application status directly in your dashboard (`Sent` → `Interview` → `Offer`).
