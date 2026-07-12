# SpendLens — Build Plan

> **Audience**: This document is written for AI coding agents (and humans) continuing work on
> SpendLens. It assumes no prior conversation context. Read the whole file before starting any
> task. Every task has acceptance criteria — do not mark a task done unless they pass.

---

## 1. What SpendLens is

A **single-user personal finance app** for Noel (Singapore-based). It reads credit/debit card
transaction alert emails from Gmail, parses them with Gemini into structured transactions,
stores them in Firestore, and presents spend tracking, budgets, and **retirement-goal
projection** (Singapore-specific: SGD, CPF OA/SA/MA accounts, age-55 CPF unlock, 4% rule).

**Design principle**: this is a personal tool, not a multi-tenant product. Prefer simple,
direct solutions over enterprise patterns. Do not add features for hypothetical users.

### Stack & architecture

| Layer | Tech | Location |
|---|---|---|
| Frontend | React 18 + Vite, Tailwind-style utility classes, recharts, lucide-react, react-router (HashRouter) | `frontend/` |
| Backend | Node.js + Express | `backend/` |
| Database | Firestore (database id: `spendlens`) | GCP project `spendlens-492305` |
| Email parsing | Gemini 2.5 Flash (REST) with a regex fast-path for DBS alerts | `backend/gemini.js` |
| Gmail access | Gmail REST API using OAuth refresh tokens stored server-side | `backend/gmail.js`, `backend/index.js` |
| Auth | Google auth-code flow → backend issues 90-day JWT session | `backend/index.js` (`/api/auth/google`), `frontend/src/App.jsx` |
| Deploy | Cloud Build → Docker → Cloud Run (`spendlens`, region `asia-southeast1`) | `cloudbuild.yaml`, `Dockerfile` |
| Background sync | Cloud Scheduler job `spendlens-sync` → `POST /api/cron/sync` every 6h (Asia/Singapore) | `backend/index.js` |

### Key files

```
backend/
  index.js       Express app: auth middleware, /api/auth/google, sync engine
                 (runUserSync), /api/cron/sync, all REST routes, FX rate cache
  firestore.js   All Firestore access: transactions, budgets, config, syncState,
                 retirement (plan/nw/snapshots), gmailAuth (refresh tokens)
  gemini.js      Email → transaction parsing (regex fast-path + Gemini prompt).
                 Owns the backend copy of the category list.
  gmail.js       Gmail API: search email ids, fetch email bodies
frontend/src/
  App.jsx        Auth (code flow), month/viewBy state, routing, lazy-loads Retirement
  api.js         Fetch wrapper (JWT from localStorage), all API client functions
  utils/
    categories.jsx  SINGLE SOURCE OF TRUTH for category names/colors/icons (frontend)
    format.js       formatCurrency, formatMonthLabel
    dateUtils.js    getBillingMonth, getCalendarMonth (mirrors backend logic)
    retirement.js   Pure retirement math: computeRetire, cpfAlloc, field defs
  components/    NavBar (desktop sidebar + mobile top/bottom bars), Toast/useToast,
                 LoadingCard
  views/         Overview, Transactions, Retirement, Config, SetupWizard
```

### Domain rules (do not break these)

- **Billing month**: a card's `startDay` is the *statement closing day* — the LAST day
  included in that month's bill. E.g. closing day 12: Apr 1–12 → April bill, Apr 13+ → May
  bill. Logic exists twice by design (`backend/firestore.js getBillingMonth`,
  `frontend/src/utils/dateUtils.js`) — keep them identical.
- **Only `CHARGE` transactions are stored.** Gemini classifies emails as
  CHARGE / AUTH_HOLD / PAYMENT; the sync filter drops the latter two (see
  `runUserSync` in `backend/index.js`). Refunds and incoming transfers are therefore
  not tracked (see Task B6).
- **Category list** exists in two runtimes: `frontend/src/utils/categories.jsx` (canonical
  for UI) and `backend/gemini.js` `CATEGORIES` (canonical for parsing). If you change one,
  change the other.
- **Currency**: transactions store `amount` (original currency), `amountLocal` (SGD),
  `isLocal`. FX conversion happens once at sync time using daily ECB rates
  (`getFxRates` in `backend/index.js`, frankfurter.dev, 24h in-memory cache, hardcoded
  fallback table).
- **Auth**: sign-in exchanges a Google auth code for (a) a refresh token stored in the
  Firestore `gmailAuth` collection and (b) a 90-day JWT (`SESSION_SECRET`) kept in
  localStorage key `spendlens_token`. Google only returns a refresh token on FIRST consent —
  the `/api/auth/google` handler covers the re-consent case. Sign-out is local-only by
  design (clearing the session must NOT delete the refresh token, or background sync dies).

### Firestore collections

```
transactions/{email}/records/{emailId}   parsed transactions (+ month, calendarMonth)
budgets/{email}/monthly/{YYYY-MM}        { overall, byCard, byCategory }
settings/{email}                         { localCurrency, cards[], billingCycles, cardAliases, syncPeriodMonths, setupComplete }
syncState/{email}                        { lastSyncedAt, lastEmailId, oldestSyncedMonths, progress, syncError }
retirement/{email}                       { plan, nw, snapshots[] }
gmailAuth/{email}                        { refreshToken, updatedAt }
```

### Secrets (GCP Secret Manager, project spendlens-492305)

`GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`,
`CRON_SECRET`. Wired into Cloud Run via `cloudbuild.yaml`.
**Never print secret values. Never commit them. `backend/.env` (gitignored) holds local
copies but is missing the three newer vars — see Task B1.**

---

## 2. History — what has been built (chronological)

| Date | PR | What |
|---|---|---|
| pre-2026-07 | — | Original prototype: a single-file HTML app (preserved on `legacy` branch) |
| 2026-07-03 | — | Repo restructured: local full-stack app force-pushed as `main`; old main → `legacy`; PR #1 (prototype-era) closed |
| 2026-07-03 | #2 | **Retirement tab**: pure math module (CPF interest 2.5/4/4%, age-banded contribution allocation, inflation-adjusted target = 12×spend÷withdrawal-rate, monthly simulation to age 90, "ready age"), recharts projection + net-worth history charts, Firestore persistence (`/api/retirement`, `/api/retirement/snapshot`) |
| 2026-07-03 | #3 | **Bug fixes**: silent-refresh attempt for hourly token expiry (superseded by #5), foreign-currency display on transactions (was fake timestamps), set-budget CTA (was invented S$5,000 default), Settings saves both tabs, live daily FX rates with fallback, "Statement Closing Day" label |
| 2026-07-03 | #4 | **UX**: mobile month picker + billing/calendar toggle, tap-to-recategorize transactions (`POST /api/transactions/update`), merchant search, PWA manifest+icons, error states with retry, monthly auto-snapshot of net worth, styled toasts + two-step confirm, lazy-loaded Retirement (main bundle 643→239 kB), deleted unused components, CSP tightened (no `unsafe-inline` in script-src) |
| 2026-07-05 | #5 | **Server-side auth**: Google auth-code flow, refresh tokens in Firestore, 90-day JWT sessions, sync engine extracted to `runUserSync`, `POST /api/cron/sync` (header `X-Cron-Key` = `CRON_SECRET`), Cloud Scheduler job `spendlens-sync` every 6h, Cloud Run `--timeout=900` |
| 2026-07-12 | *(pending)* | **Refactor** (uncommitted on branch `refactor`, see Task A1): shared `utils/categories.jsx` (fixes Entertainment/Education/Income donut colors), `utils/format.js`, `Toast`/`useToast`, `LoadingCard`, session token single-sourced to localStorage, Retirement duplicate-fetch + no-op-save fixes, backend FX hoist + parallel sync-start reads, `getUserId` wrapper removed, NavBar class dedupe |

**Deployed**: everything through PR #5 is live at https://spendlens-czunj6cxta-as.a.run.app
(Cloud Run revision `spendlens-00019+`). The refactor is NOT yet committed/deployed.

---

## 3. Conventions for implementers (READ THIS)

1. **Branch → PR → merge → deploy.** One branch per coherent group of tasks. PR into `main`
   on `github.com/noeltan/spendlens`. `gh` CLI is NOT installed; use the GitHub REST API with
   the stored git credential (`git credential fill`) — see existing pattern, or ask the user.
2. **Verify before claiming done**:
   - Frontend: `cd frontend && npx vite build` must pass.
   - Backend: `node --check backend/index.js backend/firestore.js` must pass.
   - Pure logic (retirement math, billing month, FX): test with a `node -e` snippet or, once
     Task B2 lands, `npm test`.
3. **Deploy**: from repo root on `main`:
   `/Users/noel/Documents/Projects/google-cloud-sdk/bin/gcloud builds submit --config cloudbuild.yaml --project spendlens-492305 .`
   Then check `https://spendlens-czunj6cxta-as.a.run.app/health` returns 200. Ask the user
   before deploying unless they've already said to.
4. **UI style**: match existing patterns — white cards `rounded-[28px] border
   border-slate-200/85`, slate/blue palette, lucide icons, mobile-first (bottom tab bar).
   Use `Toast`/`useToast`, `LoadingCard`, `categoryMeta()` — do not re-implement them.
5. **No comments explaining WHAT code does**; only non-obvious WHY.
6. **Secrets**: read from env; never log or echo them.
7. Gemini prompt changes (`backend/gemini.js`) are high-risk: they affect all future parsing.
   Test against a real email body before merging if possible.

---

## 4. Task backlog

Ordered by priority. `[A]` = unblock/housekeeping, `[B]` = bugs & robustness,
`[C]` = value features, `[D]` = scalability & polish.

### A — Immediate / housekeeping

- [ ] **A1. Commit and ship the pending refactor.**
  State: branch `refactor` has staged changes (see §2 last row). Committing was blocked
  because git identity is unset on this machine. Steps: user runs
  `git config --global user.name "Noel Tan"` and
  `git config --global user.email "noel.tan88@gmail.com"`; then commit, PR, merge, deploy.
  *Accept*: PR merged; `vite build` + `node --check` pass; deployed /health 200.

- [x] **A2. Verify background sync end-to-end.** ✅ Verified 2026-07-12: manual
  `POST /api/cron/sync` returned `{ok:true, results:[{user:"noel.tan88@gmail.com", ok:true}]}`
  — refresh token is stored and the 6-hourly Scheduler job is syncing for real.

- [ ] **A3. Repo hygiene.** Delete stray empty file `0` at repo root; delete merged remote
  branches (`retirement`, `bug-fixes`, `ux-improvements`, `server-auth`) — ask user first;
  add `backend/.env.example` listing required env vars (names only, no values):
  `PORT, GEMINI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET, CRON_SECRET, FIRESTORE_DATABASE_ID`.
  *Accept*: `git status` clean; `.env.example` exists; remote branch list is just `main` + `legacy`.

### B — Bugs & robustness

- [ ] **B1. Local dev is broken for auth.** `backend/.env` lacks `GOOGLE_CLIENT_SECRET`,
  `SESSION_SECRET`, `CRON_SECRET`, so `/api/auth/google` fails locally. Fix: document in
  README how to populate them (`gcloud secrets versions access latest --secret=NAME`), or add
  an `npm run env:pull` script in `backend/package.json` that writes `.env` from Secret
  Manager (must never commit output).
  *Accept*: documented or scripted path to a working local `.env`; `.env` still gitignored.

- [ ] **B2. Add a test harness (there are ZERO tests).** Use vitest in `frontend`
  (`npm i -D vitest`, script `"test": "vitest run"`). First targets, in order:
  `utils/retirement.js` (net worth arithmetic; target = 12×spend/wr; readyAge unlocks CPF at
  55; readyAge null when unreachable by 90), `utils/dateUtils.js` (closing-day edge cases:
  day == closingDay stays in month, day+1 rolls over, Dec→Jan rollover, invalid date),
  `utils/format.js`. Backend: `node:test` for `getBillingMonth` in `firestore.js` (same
  cases). Known-good values: plan {age:35, retireAge:60, income:8000, investMonthly:2000,
  cpfMonthly:1500, ret:5, infl:2.5, spend:4000, wr:4} + nw {cash:50000, invest:150000,
  srs:20000, cpfOA:80000, cpfSA:60000, cpfMA:40000, property:800000, mortgage:400000}
  → netWorth 800000, retireAssetsNow 220000, targetNow 1200000, readyAge 55.
  *Accept*: `npx vitest run` green; the listed cases covered.

- [ ] **B3. Interactive sync is unreliable on Cloud Run.** `/api/sync` responds immediately
  and continues work in the background, but Cloud Run throttles CPU after the response unless
  requests keep arriving (today the frontend's 2s `/api/syncstate` polling keeps the instance
  warm — fragile). Options, in order of preference: (1) set Cloud Run
  `--no-cpu-throttling` in `cloudbuild.yaml` deploy step (simplest, slight cost increase);
  (2) make `/api/sync` synchronous and raise frontend timeout expectations; (3) Cloud Tasks.
  Pick (1) unless the user objects.
  *Accept*: a sync started from the UI completes even if the browser tab is closed
  immediately after triggering (verify via syncState.lastSyncedAt updating).

- [ ] **B4. Overview sync-poll leaks.** `frontend/src/views/Overview.jsx`: `pollRef`
  interval isn't cleared on unmount (navigate away mid-sync → interval keeps firing) and
  `setSyncProgress` fires unconditionally every 2s. Fix: `useEffect` cleanup clearing
  `pollRef.current`, and only `setSyncProgress(prog)` when the value actually changed
  (compare stage+current+total).
  *Accept*: navigating away mid-sync stops polling (verify via network tab); no state
  updates when progress is unchanged.

- [ ] **B5. Toast timer leak.** `frontend/src/components/Toast.jsx` `useToast`: the timeout
  isn't cleared on unmount. Add `useEffect(() => () => clearTimeout(timer.current), [])`.
  *Accept*: no React "state update on unmounted component" warnings when navigating right
  after an action shows a toast.

- [ ] **B6. Refunds silently overstate spend.** PAYMENT-type parses (refunds/reversals) are
  dropped at sync, so a S$500 refunded purchase still counts S$500 spend. Design decision
  needed — options: (a) store PAYMENTs flagged `type:'PAYMENT'` and subtract merchant-matched
  refunds in `getSummary`; (b) keep dropping but let the user delete a transaction from the
  edit panel (add DELETE to `/api/transactions/update`). Option (b) is simpler and fits the
  manual-correction pattern; recommend (b).
  *Accept (b)*: edit panel has a delete action with confirm; deleted txn disappears from
  list + summary; Firestore record removed.

- [ ] **B7. Transactions hero mislabels filtered totals.** `views/Transactions.jsx` hero
  says "This Month's Spend" but shows the *filtered* total (card/category/search applied).
  Fix: when any filter is active, change the label to "Filtered Spend" (keep month title).
  *Accept*: label switches when filters/search active; unfiltered view unchanged.

- [ ] **B8. Retirement debounced save can drop last edits.** The 800ms debounced
  `saveRetirement` in `views/Retirement.jsx` is cancelled by the effect cleanup — navigating
  away within 800ms of the last keystroke loses the edit. Fix: flush on unmount (in cleanup,
  if a timer is pending, fire the save immediately) — do NOT just remove the cleanup.
  *Accept*: edit a field, navigate away within 800ms, reload → value persisted.

- [ ] **B9. JWT sessions cannot be revoked.** Acceptable single-user trade-off, but document
  it: a leaked session token is valid 90 days. Cheap hardening: include an `iat` check —
  store `sessionsInvalidBefore` timestamp in the user's `settings` doc; middleware rejects
  tokens with `iat` older; add a "Sign out everywhere" button in Settings that sets it.
  LOW priority; skip unless asked.

### C — Value features (each is one PR)

- [ ] **C1. Income auto-tracking.** The Retirement "This Month" card uses a manually entered
  income figure. Gemini already classifies salary credits as PAYMENT but they're dropped.
  Store PAYMENTs matching salary heuristics (Gemini prompt already lists "Salary or payroll
  credits") in a separate `income/{email}/records` collection during sync; expose
  `GET /api/income?month=`; Retirement view uses actual income when available, falling back
  to the manual field. Keep the manual field as an override.
  *Accept*: after a sync that ingests a salary alert email, Retirement "This Month" income
  shows the actual amount; manual field still works when no data.

- [ ] **C2. Budget rollover.** Budgets are per-month docs; a new month starts empty. Add
  "Copy from last month" — when `GET /api/budget` finds no doc for the requested month,
  return the most recent prior month's budget with a flag `inherited: true`; Overview shows
  it normally; first save materializes it. Backend-only change + small UI hint.
  *Accept*: set budget in month M; month M+1 shows same budget with subtle "inherited"
  hint; editing and saving creates the M+1 doc.

- [ ] **C3. Subscription/recurring-charge detection.** Backend endpoint
  `GET /api/subscriptions`: group transactions by merchant across all months
  (`getAllTransactions`), flag merchants appearing in ≥3 distinct months with amounts within
  ±10%; return merchant, avg amount, months seen, last date. New card on Overview listing
  them with monthly total. No schema changes.
  *Accept*: a merchant charged monthly 3+ times appears; one-off merchants don't.

- [ ] **C4. CSV export.** `GET /api/transactions/export?from=YYYY-MM&to=YYYY-MM` streams CSV
  (date, merchant, category, card, amount, currency, amountLocal, month). Button in Settings.
  Use the JWT auth header via fetch + blob download (the endpoint requires the Authorization
  header, so a plain `<a href>` won't work).
  *Accept*: downloaded CSV opens in a spreadsheet with correct rows for the range.

- [ ] **C5. Monthly insights (Gemini).** `GET /api/insights?month=` — send the month's
  summary + previous month's (byCategory, byCard, topMerchants, totals) to Gemini with a
  prompt asking for 3–5 short, specific observations (biggest category shift, unusual
  merchants, savings-rate note; Singapore context). Cache result in Firestore per month so
  it's generated once. Card on Overview.
  *Accept*: insights render for a month with data; second load hits cache (no Gemini call);
  months without data show nothing.

- [ ] **C6. Budget-breach notification.** After each sync (`runUserSync` end), if month
  spend crosses 80% or 100% of the overall budget and a flag in syncState says it wasn't
  already notified this month at that threshold, send an email via Gmail API
  (`gmail.send` scope is NOT currently granted — simplest alternative: use the existing
  nightly cron result + a `notifications` doc the frontend surfaces as a banner). Start
  with the in-app banner version; email/push later.
  *Accept*: crossing 80% budget during a sync produces a dismissible banner on next app
  open; doesn't re-fire for the same month+threshold.

- [ ] **C7. Retirement scenario compare.** Allow a second "what-if" plan (e.g. retire at 55
  vs 60, +S$500/mo investing): a toggle in the Retirement view that overlays a second
  projection line computed from modified inputs. Pure frontend — `computeRetire` is already
  a pure function; run it twice. Persist the scenario in the existing retirement doc under
  `scenario`.
  *Accept*: toggling shows a second line + its ready age; persists across reloads.

### D — Scalability & polish

- [ ] **D1. CI on GitHub Actions.** `.github/workflows/ci.yml`: on PR + push to main, run
  frontend `npm ci && npx vite build && npx vitest run` and backend `npm ci && node --check
  index.js firestore.js gemini.js gmail.js` (+ `node --test` once B2 backend tests exist).
  The empty `.github/workflows/` dir already exists.
  *Accept*: CI green on a test PR; a deliberate syntax error fails it.

- [ ] **D2. Service worker / offline shell.** PWA currently has manifest+icons only. Add
  `vite-plugin-pwa` (generateSW mode): precache the app shell, `NetworkFirst` for `/api/*`
  GETs so the last-seen dashboard renders offline with a stale-data banner. Do NOT cache
  POSTs or auth.
  *Accept*: with dev tools offline, a previously visited Overview renders with cached data
  and shows a stale indicator; sync/edit actions fail gracefully.

- [ ] **D3. Monitoring & alerting.** Cloud Monitoring alert: (1) Cloud Scheduler job
  failures (metric `cloudscheduler.googleapis.com/job/attempt_count` with status!=OK), (2)
  Cloud Run 5xx rate > 0 over 1h. Notification channel: email noel.tan88@gmail.com.
  gcloud CLI is available and authenticated.
  *Accept*: `gcloud alpha monitoring policies list` shows both; a forced failure (call cron
  endpoint with bad method via scheduler test-run of a bad job — or just document the test)
  triggers an email.

- [ ] **D4. Refresh-token hardening.** `gmailAuth` stores the Google refresh token in
  plaintext Firestore. Adequate for single-user (GCP project access == game over anyway),
  but cheap upgrade: encrypt with Cloud KMS before store / decrypt on read
  (`@google-cloud/kms`, one key ring). LOW priority.

- [ ] **D5. Style dedupe (cosmetic).** The ~90-char card class string
  (`rounded-[28px] border border-slate-200/85 …`) appears ~11× across views; the stat-tile
  class ~10×. Add `.card` and `.stat-tile` classes in `frontend/src/index.css` (which
  already hosts `page-outer`, `bottom-tab-bar`) and replace usages. Also NavBar's 6
  hand-rolled SVG icons duplicate lucide's Settings/User/TrendingUp — swap to lucide imports.
  Purely mechanical; do last.
  *Accept*: `vite build` passes; visual diff of all four views unchanged.

- [ ] **D6. Gemini cost/latency guard.** Sync sends email batches of 10 to Gemini with no
  retry/backoff; a Gemini 429/500 fails the whole batch silently (charges skipped, emails
  marked processed? — verify: they are NOT marked processed individually; failed parse
  returns only regex results, and those email ids WILL be skipped next sync because
  `getProcessedEmailIds` is based on saved records only — so unsaved ones retry. Confirm
  this reasoning in code first). Add: 2 retries with exponential backoff on 429/5xx in
  `parseEmails`, and log a warning with the failed email count into syncState.syncError.
  *Accept*: simulated 429 (mock) retries then succeeds; sync surfaces partial-failure info.

---

## 5. Known trade-offs (documented decisions — do not "fix" without discussion)

- **Cron sync runs inline in the request** (up to 900s) rather than background — deliberate,
  because Cloud Run throttles CPU after response and there's no poller for cron. Revisit only
  with B3's `--no-cpu-throttling`.
- **Sign-out keeps the refresh token** so background sync survives; "disconnect Google"
  would be a separate, explicit action (not built).
- **Two copies of billing-month logic** (frontend + backend) — small, and avoids an API
  round-trip; keep in lockstep.
- **Backend category list duplicated in gemini.js** — different runtime; a comment marks it.
- **`amountLocal` frozen at sync-time FX rate** — historical accuracy beats live restating.
- **Rate limit 100 req/15 min per IP** on `/api` (syncstate exempt) — fine for one user.

---

## 6. Quick reference

```bash
# Build & verify
cd frontend && npx vite build
node --check backend/index.js backend/firestore.js

# Deploy (from repo root, on main — ask user first)
/Users/noel/Documents/Projects/google-cloud-sdk/bin/gcloud builds submit \
  --config cloudbuild.yaml --project spendlens-492305 .

# Health / smoke
curl -s https://spendlens-czunj6cxta-as.a.run.app/health           # → 200 "ok"
# Cron (never echo the key):
# curl -X POST .../api/cron/sync -H "X-Cron-Key: $(gcloud secrets versions access latest --secret=CRON_SECRET --project spendlens-492305)"

# Scheduler status
gcloud scheduler jobs describe spendlens-sync --location asia-southeast1 --project spendlens-492305
```

**Live app**: https://spendlens-czunj6cxta-as.a.run.app
**Repo**: https://github.com/noeltan/spendlens (`main` = truth, `legacy` = old prototype)
