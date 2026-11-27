# Beginner's Guide: Cloudflare Worker + R2 + Auto-Cleanup Cron

This guide explains how your new **`wsi-media-worker`** works in plain English so you can maintain, inspect, or expand it anytime (including adding AI later!).

---

## 1. What Is a Cloudflare Worker (and How Does It Work With Netlify)?

Think of your portal as two friendly halves:
- **Netlify (Frontend):** Serves your React website (`wcsattendancetracker.netlify.app`).
- **Cloudflare Worker (`wsi-media-worker`):** Runs a tiny backend API right next to your **Cloudflare R2 storage bucket (`washingtonschool`)**.
- **Firebase Firestore (Database):** Stores only short URLs (and lightweight annotation JSON), **never** heavy image/PDF/DOCX files.

Why use a Cloudflare Worker instead of Netlify Functions?
- It runs directly inside Cloudflare's network with **native R2 access** (`env.MEDIA_BUCKET`) — zero AWS/S3 API keys needed.
- You get **100,000 free requests per day** and **unlimited free R2 downloads**, so student homework files never eat up your Netlify function quota.

---

## 2. How the Folders Inside R2 Work

Your bucket `washingtonschool` organizes uploaded files into three folders:

| Folder in R2 | Uploaded By | Kept Forever or Auto-Deleted? |
| :--- | :--- | :--- |
| `avatars/` | Students, Teachers & Admins (Profile Photos) | **Kept forever** (auto-resized to `300px`, tiny!) |
| `task-media/` | Teachers (Diagrams/charts inside Quiz questions) | **Kept forever** (so teachers can reuse quizzes) |
| `submissions/{SchoolYear}/{Term}/{StudentUID}/` | Students (Homework Photos, PDFs, DOCX) | **Auto-deleted 14 days after each Term ends** |

Every student homework file gets stamped with an **`expiresAt`** tag (for example `2027-03-04` for Term 2) when uploaded.

---

## 3. How Cron Jobs (Scheduled Triggers) Work

A **Cron Trigger** is just an alarm clock for your Worker. Instead of waiting for someone to visit a webpage, Cloudflare wakes up your Worker automatically on a schedule.

Inside [`cloudflare-worker/src/index.js`](file:///c:/Users/gabri/.gemini/antigravity/scratch/attendance-tracker-v2/cloudflare-worker/src/index.js):
- `export default { async fetch(...) {}, async scheduled(event, env, ctx) {} }`
- **`fetch(...)`** handles normal website requests (`POST /api/upload`, `GET /media/...`).
- **`scheduled(...)`** is woken up every night at **2:00 AM Manila time** (`0 18 * * *` UTC).

Each time the Cron wakes up `scheduled(...)`:
1. It checks today's date in Manila (`Asia/Manila`).
2. It lists **only** files inside `submissions/` (it never touches `avatars/` or `task-media/`).
3. Any file whose `expiresAt` date has passed (`expiresAt < todayManila`) gets permanently removed from R2.
4. Old graded submissions in your React app detect the cleared file cleanly and display an **"Archived after Term End — Score & Comments Preserved"** card instead of a broken image.

### Reading Cron Expressions (`"0 18 * * *"`)
A cron string has 5 fields: `minute hour day-of-month month day-of-week` (always in **UTC** time; Manila is **UTC+8**):
- `0` → minute `00`
- `18` → hour `18:00 UTC` (= `2:00 AM` next day in Manila!)
- `* * *` → every day, every month, every day of the week

---

## 4. How Login Security Works (Without Secret Keys in React)

When a student or teacher uploads a file, React grabs their active **Firebase ID Token** (`auth.currentUser.getIdToken()`) and sends it in the `Authorization: Bearer ...` header.
Your Worker downloads Google's official public keys and cryptographically verifies that the token:
1. Came from Firebase for your exact project (`wcs-attendance-tracker`), and
2. Has not expired.

Anyone not signed into your portal gets rejected with `401 Unauthorized`.

---

## 5. How to Monitor & Test Your Worker in Cloudflare Dashboard

1. Log in to **Cloudflare Dashboard** → **Workers & Pages** → **`wsi-media-worker`**.
2. **Logs & Traces (`Observability` tab):** View real-time HTTP uploads and daily JSON logs like:
   `{"event":"cron_term_cleanup","checkedCount":42,"deletedCount":18,"freedBytes":14820192}`
3. **Cron Schedule (`Settings → Triggers` tab):** See `0 18 * * *` and trigger a manual test run anytime.
4. **R2 Bucket (`Storage & databases → R2 → washingtonschool`):** Browse `avatars/`, `task-media/`, and `submissions/` visually.
5. **In-App Quick Check:** Sign in as Admin and click the subtle **`R2 Storage & Cleanup`** link at the bottom footer of the Admin Console to preview expired files or trigger cleanup on demand.

---

## 6. One-Time Netlify Env Var Setup (For Production)

When deploying to Netlify, add **one** environment variable in **Netlify → Site configuration → Environment variables**:
- **Key:** `VITE_MEDIA_WORKER_URL`
- **Value:** `https://wsi-media-worker.wsi-media.workers.dev` (already added to your local `.env`)

Then trigger a Netlify redeploy (or push to GitHub) so the live site uses your Cloudflare Worker!
