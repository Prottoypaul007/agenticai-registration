# Workshop on agentic software engineering — registration website

Next.js, TypeScript, Tailwind CSS, shadcn-style UI components, Framer Motion, Supabase, React Hook Form, and Zod. The workshop is October 17–18, 2026 at the Institute of Information Technology (IIT), University of Dhaka.

For email tickets and workshop check-in, see [CHECKIN_SETUP.md](CHECKIN_SETUP.md).

## 1. Supabase setup

1. Create a Supabase project. In **Project Settings → API**, copy the **Project URL**, **anon/publishable key**, and **service_role/secret key**.
2. Copy `.env.example` to `.env.local`. Replace `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` with your own values. The service role key must stay server side. Never prefix it with `NEXT_PUBLIC_` or commit `.env.local`.
3. Open the Supabase **SQL Editor** and run the migrations in order: `001_initial.sql`, `002_remove_spam_protection.sql` (only if the older version of 001 was already installed), `003_payment_and_refunds.sql`, `004_payment_methods.sql`, `005_llm_readiness_questions.sql`, `006_email_and_checkin.sql`, `007_manual_review_and_qr_delivery.sql`, `008_batch14_google_sheet.sql`, `009_batch14_beyond_website_capacity.sql`, `010_batch14_import_payment_conflicts.sql`, `011_cross_group_payment_conflicts.sql`, `012_reconcile_batch14_sheet_deletions.sql`, `013_fix_batch14_reconciliation_safe_update.sql`, `014_contest_teams.sql`, `015_admin_mailbox.sql`, and `016_temporary_mailbox_attachments.sql`. For an existing project that already has 015, run only 016. Migration 009 lets Batch 14 imports continue after the website reaches its closing threshold. Migration 010 imports rows with duplicate transaction IDs for admin review while blocking QR delivery until the sheet is corrected and synced.
4. In **Authentication → Users**, create an admin user with an email and password. Copy its UUID. Add it to the allowlist in SQL Editor:

   ```sql
   insert into public.admins (user_id) values ('PASTE_AUTH_USER_UUID_HERE');
   ```

   Public signup is not implemented. Authentication alone does not grant admin access; the UUID must be inserted by a trusted project owner.
5. In **Authentication → URL Configuration**, set the Site URL to `http://localhost:3000` for local use or your production domain after deployment. Password sign-in uses Supabase Auth cookies.
6. Migration 004 sets the organizer-provided bKash number to `01817889286` and Rocket account number to `018178892865`. Migration 007 makes manual payment review and QR delivery the confirmation step. Migration 008 adds Batch 14 registration. Migration 009 lets Batch 14 imports continue beyond the website closing threshold. Nagad remains disabled until the organizer confirms its number. Payment numbers can be changed in `/admin` → **Event settings**.

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

Go to `/admin` and sign in with the allowlisted Supabase Auth account. The dashboard shows registration, attendance, payment, and refund totals. The Payment review queue lets an admin match a submitted transaction ID and then send the QR ticket, or cancel with a selected reason and polite email. Separate views track sent, rejected, and failed deliveries. The participant table supports name search, institution, programming level and attendance filters, detail review, completion, and refund recording. The **Export** tab downloads either a printable payment signature PDF or a detailed CSV for Excel or Google Sheets, with both groups, outsiders only, or Batch 14 only. Batch 14 exports sync the Google Sheet first. The CSV includes the original Form answers and payment fields; the PDF lists only QR-sent participants with contact and bank details, BDT 1,200 before VAT and tax, BDT 920 after VAT and tax, and a blank signature column. Event settings control opening/closing times, capacity, approval, single-day attendance, IIT student ID, bKash/Rocket/Nagad numbers, event time, and venue. Blank opening/closing times mean no time limit; blank capacity means unlimited. Times are entered and displayed in Bangladesh time; Supabase stores timestamps in UTC.

Pending registrations do **not** count as confirmed. Payment must be verified before approval. Changing a participant to rejected frees one place if capacity is set. A previously rejected email remains reserved to prevent duplicate registration.

### Contest Team Management

After applying migration 014, open **Contest Team Management** in `/admin`. **Form Teams** randomly assigns every QR-confirmed outsider and Batch 14 participant to a saved preview. Review names, phones, and emails, or click **Regenerate Teams** to replace the preview. Neither action sends email. **Send Emails** asks for confirmation, freezes the teams, and starts individual Gmail notifications. The dashboard shows pending, sent, failed, and uncertain sending states. Use **Send pending emails** if a browser session was interrupted, and **Retry failed emails** only for failed records. Finalized teams cannot be regenerated. For exactly six participants, the system forms two teams of three because there are not two existing teams to receive the extra members.

### Admin Mailbox

After applying migration 015, open **Mailbox** in `/admin`. Search active outside and Batch 14 registrations by name, email, or phone, then choose individual recipients or **Select All Participants**. Rejected outside registrations are excluded. Write a subject and message; the editor supports paragraphs, line breaks, bold, italic, and bullets. **Save Draft** stores an unsent message. **Preview Email** shows the rendered content and complete recipient list. **Send Email** asks for confirmation, freezes the recipients, and sends each person an individual Gmail message. The **Sent Emails** view tracks each delivery and lets admins resume pending or retry failed messages without resending successful ones. A **Needs review** status means Gmail may have accepted the message even though its result could not be recorded; check the sender mailbox before resolving it. Keep the admin browser tab open while bulk mail is sending, or resume pending deliveries later. Mailbox messages do not change contest team notifications.

After applying migration 016, **Attach Resources** accepts up to five PDF, Office, image, ZIP, or text files with a combined limit of 10 MiB. The files upload directly to a private temporary Supabase Storage bucket. A message body is optional when files are attached. Preview lists every recipient and file before confirmation. Files remain available for retries, are removed after all deliveries finish, and expire after seven days if delivery is still incomplete. Unsent draft files expire after one day. A daily Vercel cron removes expired files; set `CRON_SECRET` in Vercel Production to a long random value so Vercel can authorize it. Sent Emails retains file names and sizes, but not the file content or a download link. To replace a file, remove it and attach the replacement before sending.

## Batch 14 Google Form

1. In the Google Cloud project, enable the [Google Sheets API](https://developers.google.com/workspace/sheets/api/quickstart/js). Create a service account and a JSON key. The site uses only the service account email and `private_key` from that JSON; keep the key server side.
2. Share the private Form response spreadsheet with the service account email as a **Viewer**. No domain-wide delegation is needed. Set `GOOGLE_SHEETS_SPREADSHEET_ID` to the part of the spreadsheet URL after `/d/`, and `GOOGLE_SHEETS_GID` to the response tab's `gid`. Set `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SHEETS_PRIVATE_KEY` from the JSON key in `.env.local` and Vercel's server environment. The private key may contain real newlines or literal `\n` escapes. Do not commit these values.
3. Apply migrations 008 through 013 in order. In `/admin` → **Batch 14**, click **Sync Google Sheet**. Sync adds new responses, removes responses deleted from the sheet, and updates shifted row numbers by matching student emails. A removed response invalidates its QR code, even if it was already sent. Batch 14 imports continue after the website reaches its closing threshold.
4. Check each Batch 14 transaction ID against the payment account, then click **Verify payment & send QR** for that student. QR delivery uses the existing Google Workspace sender. The Form has no attendance choice, so imported students are registered for both days. Other Form answers remain visible to admins in the Batch 14 details.
5. Turn on **Open remaining seats to outside registrations** in **Event settings** and save. The website closes when the combined count reaches capacity (45 for this event). The Batch 14 Google Form can keep collecting responses beyond that threshold, and syncing imports them for admin review. Batch 14 students use only the Google Form. The public total count and the **Present** tab include both groups.

The Google Sheets connection also syncs new Form responses before each outside registration is accepted, so the current Batch 14 responses take priority in the shared capacity check. It never edits the spreadsheet. The Batch 14 dashboard syncs on opening and every minute while visible; the Sync button refreshes it immediately. If Google Sheets is temporarily unavailable, outside submissions pause rather than risk overbooking Batch 14 places.

### Capacity concurrency verification

Run `npm run test:concurrency` to test the actual database functions in a fresh, isolated local PostgreSQL cluster. The test applies every migration, sets the test capacity to 40, and submits 310 requests over separate concurrent database connections. It verifies an empty event, competition for the final place with Batch 14 entries, a full event, all places taken by Batch 14, rejected registrations freeing places, and an existing Batch 14 count above the limit. Every request in each scenario waits on the database lock before the test releases them together. The temporary cluster is stopped and removed afterwards; live Supabase data and settings are never used or changed. Port 15432 must be available.

Pending website registrations and all imported Batch 14 entries count toward capacity; rejected website registrations do not. Changing the live capacity to 40 must be done in Admin → Event settings. Closing the Batch 14 Google Form does not remove its existing responses or prevent the website from syncing them.

## 4. Vercel deployment

1. Push this project to a private or public Git repository without `.env.local`.
2. Import it into Vercel as a Next.js project.
3. Add the Supabase, Gmail API, and check-in signing variables from `.env.example` in Vercel **Project Settings → Environment Variables**.
4. Set Supabase Auth's Site URL to the production domain.
5. For a fresh project, apply migrations 001 through 016 in order, then deploy. For a site already on 015, apply migration 016 before using mailbox attachments. Add `CRON_SECRET` to Vercel Production environment variables before deployment; the scheduled cleanup endpoint uses it to remove expired temporary files. The build runs `next build`.

### GitHub Actions credentials and project settings errors

The production workflow requires three repository secrets in **GitHub → Settings → Secrets and variables → Actions**:

- `VERCEL_TOKEN`: a valid Vercel access token with access to the account/team that owns this project.
- `VERCEL_ORG_ID`: the existing project's `orgId`.
- `VERCEL_PROJECT_ID`: the existing project's `projectId`.

To obtain matching IDs, log into Vercel locally and run `npx vercel@53 link` from this repository. Select the owning account/team and link to the **existing** registration project. Copy `orgId` and `projectId` from the generated `.vercel/project.json` into the GitHub secrets. Keep `.vercel` ignored by Git and never commit or paste the token into logs.

If **Pull Vercel Environment Information** reports `Could not retrieve Project Settings`, confirm that both IDs belong to the same existing project and that the token is unexpired and has access to its owner. Vercel has also [reported failures with project-scoped tokens](https://github.com/vercel/vercel/issues/17506); if using one, replace it with a token scoped to the owning team/account that can retrieve project settings. Re-run the failed workflow after updating the secrets. Removing a local `.vercel` directory does not repair incorrect GitHub secrets: the Actions runner uses those secrets to select the project.

See [Vercel's GitHub Actions guide](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel) for the credential setup and deployment sequence.

## Security design

Only server routes use the Supabase service role. All application tables have RLS enabled, with no direct public policies. Public submissions are validated both in the browser and server, then passed to a database function that serializes duplicate, method-specific transaction ID, capacity, deadline, and attendance checks in one transaction. The normalized email and payment transaction ID indexes are final duplicate guards. Admin routes call Supabase Auth `getUser()` and check membership in `public.admins` on every request. CSV exports and registration records are never served to public users. The registration success link contains only a reference and signed status, not participant data.
