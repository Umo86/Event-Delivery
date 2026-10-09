# Event Delivery

Signage and sponsorship delivery for UK Construction Week: organiser signage, sponsor signage and sponsorship items in one schedule, with artwork proofs, a sign-off route (Operations → Marketing → Sponsor → Final sign-off), sponsor approval links and production tracking.

Built with Next.js, a Neon Postgres database and Vercel Blob for artwork files. Everything runs on Vercel's free tier.

## What it does

- **Three schedules**: organiser signage (OS-001…), sponsor signage (SS-001…) and sponsorship items (SI-001…), with search, filters and CSV export. Signage opens on a **sheet view** laid out like the team's spreadsheet: code and plan code, description, material, size, sides, bleed, side 1 and side 2 wording, quantity, cost and total, supplier and status, grouped under the show's sections with totals. Suppliers and production status save straight from the row. The **workflow view** shows what each line is waiting on. Sponsorship items start for sale; anyone in the company can mark one sold, with its sale price.
- **Status in six words**: every line is Ready to artwork, Artworked, Approved, Sent, Printed or Installed, worked out from what has happened to it, with the sheet's colours (Sent in teal, so red stays for problems). Held-up lines (changes requested, rejected, on hold) count as Artworked and say why.
- **Artwork proofs**: upload PDF or image proofs; previews and thumbnails are made in the browser. Every version is kept, and a new version restarts sign-off.
- **Sign-off route**: stages run in order, each with a named approver. Sections (Show setup › Sections) group the sheet in show order. The sponsor stage is signed off by the sponsor's account manager, or by the sponsor themselves through a private approval link (no account needed).
- **My actions**: each person sees what is waiting on them, most urgent first. The dashboard shows progress, overdue lines, workload, cost against budget and sponsors needing attention.
- **Shows**: All shows puts every show side by side. **New show** walks through it step by step: name and venue, then build-up, opening, closing and breakdown on a calendar that starts from the date picked before, what to copy from a past show, and the deadlines it will set. Once it's created, **Set up** carries on one step at a time: who's working on it, who signs off, who handles artwork and production, sponsors and suppliers, saving as it goes and skipping anything already copied.
- **Production**: once fully approved, track supplier, PO, delivery and install. If artwork changes after production starts, the line is flagged.
- **Invite-only access**: nobody can sign up. Managers and super admins add people from **Show › Team** (super admins also from **Admin › People**), choosing their access level, departments and the stages they approve. That creates the account and writes the invite email to send from your own email (one click opens it in Outlook or any email app). It holds a temporary password that works for 7 days; people choose their own at first sign-in. The platform itself never sends email.
- **Access levels**: Super Admins (everything), Managers (work on lines, run shows, sign off their own stages, and manage Managers and Users on the team) and Users (read, comment and mark sponsorship items sold). **Show › Team** shows everyone's departments and what they approve in the current show; managers change people's details, passwords, departments and approvals there, and deactivate or reactivate accounts. **Admin › People** (super admins only) also chooses sponsors' account managers and keeps an access log.
- **Sponsor link switch**: sponsor approval links are the only way in without an account, and a super admin can turn them all off in one click.
- **Optional demo login**: a shared demo account whose details are shown on the sign-in page (set up in the deployment settings, removed by deactivating it in Admin › People). It can't add people or change anyone's access.
- **Admin pages** for super admins, with their own sign-in at `/gs`: People, Platform (who is signed in, maintenance mode so only super admins can use the platform, the sponsor link and demo login switches, health) and Activity (a full audit trail). The first account is the first super admin; only super admins can make or remove super admins, and nobody else can change a super admin's access, sign-in or details.

## Deploy on Vercel

1. **Import the repository** at [vercel.com/new](https://vercel.com/new) and deploy it. The first deployment will show "Almost there" until storage is connected.
2. **Add the database**: in the project, open **Storage → Create Database → Neon** (free plan). Pick the London region (`aws-eu-west-2`) and connect it to the project for all environments.
3. **Add file storage**: still in this project's **Storage** tab, **Create → Blob**, choose **Private** access and select this project. Creating the store from the project adds the `BLOB_READ_WRITE_TOKEN` the app needs for uploads. (If you choose Public access instead, also add an environment variable `BLOB_ACCESS=public`.)
4. **Redeploy** (Deployments → ⋯ → Redeploy) so the new settings are picked up.
5. Create the first admin, either way:
   - open `/setup` on your site and use the setup code you were given (it stops working once the first account exists), or
   - set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` and `BOOTSTRAP_ADMIN_PASSWORD_HASH` (a scrypt hash made with `node scripts/hash-password.mjs`, never the password itself) and redeploy. The account is created the first time the site is opened, and only while there are no accounts at all. Remove the variables afterwards.
6. Add your team from **Show › Team** (with their departments and the stages they approve), then set up the show in **Show setup** and add sponsors and suppliers.

The database tables are created automatically the first time the app connects. `vercel.json` runs the app in London (`lhr1`) to sit next to the database.

### Checking it works

- `/api/health` shows whether the database and file storage are connected.
- **Admin › Platform → Run system check** runs a temporary line through the database, file storage and every sign-off stage, then deletes it.
- `/api/selftest?token=…` runs the same check for monitoring. Set your own token with the `SELFTEST_TOKEN` environment variable.

### Optional environment variables

| Variable | Purpose |
| --- | --- |
| `SETUP_CODE` | Replaces the built-in setup code for creating the first admin |
| `SELFTEST_TOKEN` | Replaces the built-in token for `/api/selftest` |
| `BLOB_ACCESS` | `public` if your Blob store was created with public access |
| `APP_URL` | The address used in invite emails and sponsor links, if not the project's production domain |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_TITLE`, `BOOTSTRAP_ADMIN_PASSWORD_HASH` | Create the first admin without the setup page (see step 5) |
| `DEMO_ACCOUNT_EMAIL`, `DEMO_ACCOUNT_PASSWORD`, `DEMO_ACCOUNT_NAME`, `DEMO_ACCOUNT_ROLE` | A shared demo login, shown on the sign-in page so anyone with the link can try the platform. It's a member (or a viewer if the role says so) and never an admin; its password can't be changed. Deactivate it on the Admin page to take it off the sign-in page |

Neon and Blob set `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` for you when you create them from the project's Storage tab.

### Plan limits worth knowing

- **Vercel Pro**: Blob storage, uploads and downloads are billed by usage from the plan's monthly credit, so there is no hard stop. A small team's artwork proofs cost very little.
- **Vercel Hobby (free)**: for personal, non-commercial use. Blob includes 1 GB of storage, 10 GB of downloads and 2,000 uploads ("advanced operations") a month; each artwork upload uses 2 or 3 (the file, a thumbnail and, for PDFs and large images, a preview). If a Hobby limit is passed, Blob can't be used again until 30 days have passed.
- **Uploads** are limited to 25 MB each; link to full-size print files with the "Link to full-size files" field. Settings → System shows how much is stored.
- **Neon (free)** has 1 GB of storage and 100 compute hours a month. It sleeps after 5 minutes without use and wakes by itself on the next request (the first page after a quiet spell can take a moment longer). It never needs restoring by hand and nothing is deleted. Avoid pinging `/api/selftest` often, as that keeps the database awake and uses compute hours.

## Run it locally

Requires Node.js 20.9 or later.

```bash
npm install
npm run stack          # local Postgres + a file-storage stand-in; leave it running
```

In a second terminal, export the variables the stack prints, then:

```bash
INSECURE_COOKIES=1 npm run dev
```

Open http://localhost:3000/setup. The setup code also works locally, or set `SETUP_CODE` to your own.

## Tests

```bash
npm run typecheck
npm test               # unit tests for the sign-off engine and permissions
npm run test:e2e       # end-to-end: builds the app, resets the local stack and runs every page and process in Chromium,
                       # then restarts with a demo login configured and runs the demo tests
```

The end-to-end suite covers setup, sign-in and lockout, invitations (the ready-made email, cancelled and expired invites), access levels and sign-off responsibilities, the team page (managers adding people with their departments and approvals), the access log, the sponsor link switch, stages, event settings, suppliers, lists, sponsors, adding and editing lines, artwork uploads (PNG and PDF), every sign-off decision, admin decisions on behalf of others, sponsor approval links, production, cancelling and deleting, exports, the dashboard, proof sheets, permissions, events and phone layouts.
