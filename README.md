# CLA Command Center

A Vite + vanilla JavaScript study planner with Supabase Auth and database persistence.

## Included
- Sign up, sign in, sign out using Supabase Auth
- Per-user syllabus/portion tracker (subject, notes, target date, status)
- Exam date planner
- Progress overview and upcoming exam list
- Focus sprint timer (15/25/45/60 minutes) that logs completed study sessions
- Daily study-time and session-count stats
- Searchable syllabus topics
- One-click JSON backup of portions, exams, and study history
- Study reminder preferences
- Browser notification permission request and in-app date checks while the app is open
- Responsive interface

## Requirements
- Node.js 20.19+ or 22.12+ recommended
- A Supabase project
- A modern browser

## Setup

1. Unzip the project and open this folder in VS Code.
2. Open a terminal in this folder and run:

   ```bash
   npm install
   ```

3. Create a Supabase project at https://supabase.com.
4. In Supabase Dashboard, open **SQL Editor**, create a query, paste all of `supabase/schema.sql`, and run it.
5. In Supabase Dashboard, open **Project Settings → API** (or Connect), and copy the Project URL and publishable/anon key.
6. Copy `.env.example` to a new file named `.env.local`. Fill in:

   ```env
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
   ```

   Never put a Supabase `service_role` key in this frontend app. Never commit `.env.local`.

7. In Supabase Dashboard → Authentication → URL Configuration, add your local URL `http://localhost:5173` to allowed redirect URLs. Add your final Vercel URL after deployment.
8. Start the app:

   ```bash
   npm run dev
   ```

9. Open the localhost URL shown in the terminal and create an account.

## Added features
The Focus Sprint and Study Stats panels use the existing `study_sessions` table in `supabase/schema.sql`. If you created the database before these features were added, the table is already included in the supplied schema; run the schema once in your Supabase SQL Editor. Export downloads a local JSON backup and does not upload it anywhere.

## Email confirmation
Supabase may require email confirmation. Check your inbox. For local testing, configure email confirmation in Supabase Auth settings according to your needs; do not disable it for production without understanding the security implications.

## Deploy to Vercel
1. Push this folder to a GitHub repository.
2. In Vercel, import the repository.
3. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel Project Settings → Environment Variables for Production, Preview, and Development.
5. Redeploy after adding variables.
6. Add the Vercel URL to Supabase Authentication → URL Configuration (Site URL and Redirect URLs).

## About reminders (important)
This starter requests browser notification permission and checks upcoming exam dates while the app is open. Browsers generally cannot guarantee notifications while the site is closed. Reliable scheduled reminders while the app is closed require a server-side scheduled job plus a push-notification service and subscription storage; those are not configured in this starter. Treat this as an initial working prototype, not a fully operational reminder service.

## Security notes
- Row Level Security (RLS) is enabled for user data tables.
- Only the publishable/anon key belongs in the frontend. Never expose a service-role key.
- Do not store sensitive information in exam notes.
- Test sign-up, sign-in, data isolation, and build before using with real data.
