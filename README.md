# Event Deliver

Signage and sponsorship delivery for UK Construction Week: organiser signage, sponsor signage and sponsor items in one schedule, with artwork proofs, a sign-off route (Operations → Marketing → Sponsor → Final sign-off), sponsor approval links and production tracking.

Built with Next.js, a Neon Postgres database and Vercel Blob for artwork files. Everything runs on Vercel's free tier.

## What it does

- **Three schedules**: organiser signage (OS-001…), sponsor signage (SS-001…) and sponsor items (SI-001…), with search, filters and CSV export.
- **Artwork proofs**: upload PDF or image proofs; previews and thumbnails are made in the browser. Every version is kept, and a new version restarts sign-off.
- **Sign-off route**: stages run in order, each with a named approver. The sponsor stage is signed off by the sponsor's account manager, or by the sponsor themselves through a private approval link (no account needed).
- **My actions**: each person sees what is waiting on them, most urgent first. The dashboard shows progress, overdue lines, workload, cost against budget and sponsors needing attention.
- **Production**: once fully approved, track supplier, PO, delivery and install. If artwork changes after production starts, the line is flagged.
- **Roles**: admins (everything), members (work on lines, sign off their own stages) and viewers (read only).

## Deploy on Vercel

1. **Import the repository** at [vercel.com/new](https://vercel.com/new) and deploy it. The first deployment will show "Almost there" until storage is connected.
2. **Add the database**: in the project, open **Storage → Create Database → Neon** (free plan). Pick the London region (`aws-eu-west-2`) and connect it to the project for all environments.
3. **Add file storage**: still in this project's **Storage** tab, **Create → Blob**, choose **Private** access and select this project. Creating the store from the project adds the `BLOB_READ_WRITE_TOKEN` the app needs for uploads. (If you choose Public access instead, also add an environment variable `BLOB_ACCESS=public`.)
4. **Redeploy** (Deployments → ⋯ → Redeploy) so the new settings are picked up.
5. Open `/setup` on your site and create the first admin account with the setup code you were given. The code stops working once the first account exists.
6. Follow the checklist on the Settings page: add your team, choose approvers, add sponsors and suppliers.

The database tables are created automatically the first time the app connects. `vercel.json` runs the app in London (`lhr1`) to sit next to the database.

### Checking it works

- `/api/health` shows whether the database and file storage are connected.
- **Settings → System → Run system check** runs a temporary line through the database, file storage and every sign-off stage, then deletes it.
- `/api/selftest?token=…` runs the same check for monitoring. Set your own token with the `SELFTEST_TOKEN` environment variable.

### Optional environment variables

| Variable | Purpose |
| --- | --- |
| `SETUP_CODE` | Replaces the built-in setup code for creating the first admin |
| `SELFTEST_TOKEN` | Replaces the built-in token for `/api/selftest` |
| `BLOB_ACCESS` | `public` if your Blob store was created with public access |

Neon and Blob set `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` for you when you create them from the project's Storage tab.

### Free plan limits worth knowing

- **Vercel Hobby** is for personal, non-commercial use. For company use, Vercel's terms ask for the Pro plan.
- **Vercel Blob (Hobby)** includes 1 GB of storage, 10 GB of downloads and 2,000 uploads ("advanced operations") a month. Each artwork upload uses 2 or 3 of those (the file, a thumbnail and, for PDFs and large images, a preview), so roughly 650 or more uploads a month. If a Hobby limit is exceeded, Blob can't be used again until 30 days have passed, so keep an eye on Vercel's usage emails. Uploads are limited to 25 MB each; link to full-size print files with the "Link to full-size files" field. Settings → System shows how much is stored.
- **Neon (free)** has 1 GB of storage and 100 compute hours a month. It sleeps after 5 minutes without use and wakes by itself on the next request (the first page after a quiet spell can take a moment longer). It never needs restoring by hand and nothing is deleted. Avoid pinging `/api/selftest` every few minutes, as that keeps the database awake and uses compute hours.

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
npm run test:e2e       # end-to-end: builds the app, resets the local stack and runs every page and process in Chromium
```

The end-to-end suite covers setup, sign-in and lockout, team and roles, stages, event settings, suppliers, lists, sponsors, adding and editing lines, artwork uploads (PNG and PDF), every sign-off decision, admin decisions on behalf of others, sponsor approval links, production, cancelling and deleting, exports, the dashboard, proof sheets, permissions, events and phone layouts.
