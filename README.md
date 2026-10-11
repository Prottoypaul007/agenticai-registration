# Agentic Systems in Action — registration website

Next.js, TypeScript, Tailwind CSS, shadcn-style UI components, Framer Motion, Supabase, React Hook Form, and Zod. The workshop is October 17–18, 2026 at the Institute of Information Technology (IIT).

For email tickets and workshop check-in, see [CHECKIN_SETUP.md](CHECKIN_SETUP.md).

## 1. Supabase setup

1. Create a Supabase project. In **Project Settings → API**, copy the **Project URL**, **anon/publishable key**, and **service_role/secret key**.
2. Copy `.env.example` to `.env.local`. Replace `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` with your own values. The service role key must stay server side. Never prefix it with `NEXT_PUBLIC_` or commit `.env.local`.
3. Open the Supabase **SQL Editor** and run the migrations in order: `001_initial.sql`, `002_remove_spam_protection.sql` (only if the older version of 001 was already installed), `003_payment_and_refunds.sql`, `004_payment_methods.sql`, then `005_llm_readiness_questions.sql` and `006_email_and_checkin.sql`. If you already ran 001–004, run `005_llm_readiness_questions.sql` and `006_email_and_checkin.sql` now. The migrations preserve existing registrations and payment records; older registrations have blank answers for the new questions.
4. In **Authentication → Users**, create an admin user with an email and password. Copy its UUID. Add it to the allowlist in SQL Editor:

   ```sql
   insert into public.admins (user_id) values ('PASTE_AUTH_USER_UUID_HERE');
   ```

   Public signup is not implemented. Authentication alone does not grant admin access; the UUID must be inserted by a trusted project owner.
5. In **Authentication → URL Configuration**, set the Site URL to `http://localhost:3000` for local use or your production domain after deployment. Password sign-in uses Supabase Auth cookies.
6. Migration 004 sets the organizer-provided bKash number to `01817889286` and Rocket account number to `018178892865`. It opens registration and turns off separate admin approval. Nagad remains disabled until the organizer confirms its number. These numbers can later be changed in `/admin` → **Event settings**.

## Payment and refund flow

- Each workshop day costs **৳1,000**. Day 1 or Day 2 only costs ৳1,000; both days costs **৳2,000**. The server calculates the amount from the selected attendance.
- Participants choose bKash or Rocket, pay the displayed number, and enter the transaction ID from their receipt. Nagad becomes selectable only after its number is configured. The site does **not** charge them or verify the transaction automatically. The event team checks the matching payment account records and marks the payment verified. Rocket account numbers include a check digit, as described by [Dutch-Bangla Bank](https://www.dutchbanglabank.com/rocket/how-to-open-account.html).
- The form collects a bank name, account holder name, account number, and optional branch for the refund. The account holder name must match the registration name. An admin should verify actual bank ownership before transferring funds; a typed name alone cannot prove ownership.
- An admin manually confirms successful workshop completion. This makes the refund **pending**. An admin then sends the bank transfer outside the website and records the transfer reference. The website does **not** initiate bank transfers. No refund date is promised.
- Payment transaction IDs and bank details are visible only to authorized admins and appear in the admin-only CSV export. Treat exports as sensitive files.

## 2. Local development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

In Windows PowerShell, use the `.cmd` launcher if script execution is disabled:

```powershell
npm.cmd install
npm.cmd run dev
```

If `node_modules` is already present, you can skip installation and run `npm.cmd run dev` directly. Open the local URL printed by Next.js (normally `http://localhost:3000`). Press Ctrl+C to stop the server. In PowerShell, also use `npm.cmd run typecheck`, `npm.cmd test`, and `npm.cmd run build` for checks. With placeholder values, the public site can be previewed; registration and admin access become live after Supabase setup.

If a development page shows a missing file under `.next/server/vendor-chunks`, stop any old dev server with Ctrl+C and start `npm.cmd run dev` again. Development output now uses `.next-dev`, so a production build no longer replaces the files the dev server is using.

## 3. Admin workflow

Go to `/admin` and sign in with the allowlisted Supabase Auth account. The dashboard shows registration, attendance, payment, and refund totals. The participant table supports name search, institution, programming level and attendance filters, detail review, payment verification, completion, refund recording, and admin-only CSV export. Event settings control opening/closing times, capacity, approval, single-day attendance, IIT student ID, bKash/Rocket/Nagad numbers, event time, and venue. Blank opening/closing times mean no time limit; blank capacity means unlimited. Times are entered and displayed in Bangladesh time; Supabase stores timestamps in UTC.

Pending registrations do **not** count as confirmed. Payment must be verified before approval. Changing a participant to rejected frees one place if capacity is set. A previously rejected email remains reserved to prevent duplicate registration.

## 4. Vercel deployment

1. Push this project to a private or public Git repository without `.env.local`.
2. Import it into Vercel as a Next.js project.
3. Add the Supabase, Gmail API, and check-in signing variables from `.env.example` in Vercel **Project Settings → Environment Variables**.
4. Set Supabase Auth's Site URL to the production domain.
5. Apply `004_payment_methods.sql`, `005_llm_readiness_questions.sql`, and `006_email_and_checkin.sql` after the earlier migrations, then deploy. The build runs `next build`. Verify the payment destination numbers and test registration flow before accepting real payments.

## Security design

Only server routes use the Supabase service role. All application tables have RLS enabled, with no direct public policies. Public submissions are validated both in the browser and server, then passed to a database function that serializes duplicate, method-specific transaction ID, capacity, deadline, and attendance checks in one transaction. The normalized email and payment transaction ID indexes are final duplicate guards. Admin routes call Supabase Auth `getUser()` and check membership in `public.admins` on every request. CSV exports and registration records are never served to public users. The registration success link contains only a reference and signed status, not participant data.
