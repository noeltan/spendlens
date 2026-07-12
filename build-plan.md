# SpendLens — Build Plan

This document is the single source of truth for continuing development of SpendLens.
It is written so that **any LLM coding agent (or human) can pick up one task card and
implement it without extra context**. Read the whole "Context" section once, then work
strictly from task cards.

---

## How to use this document (instructions for the implementing agent)

1. Read **Context** below (architecture, data model, commands). Do not skip it.
2. Pick ONE task card (e.g. `BUG-1`). Tasks are ordered by priority inside each section.
   Respect the **Depends on** field — do not start a task whose dependency isn't merged.
3. Follow the card's **Steps** exactly. If reality differs from the card (code moved,
   already fixed), say so and adapt — do not force a stale instruction.
4. Only touch the files listed in the card unless a step says otherwise. No drive-by
   refactors, no dependency upgrades, no formatting sweeps.
5. Before committing, run the **Verification commands** and the card's
   **Acceptance criteria**. All must pass.
6. One task = one branch = one PR. Branch name: `fix/bug-1-multi-txn-emails` style.
   Describe what changed and how it was verified in the PR body.
7. If a card is ambiguous, state your interpretation in the PR description rather
   than silently guessing.

### Verification commands (run before every commit)

```bash
# Backend: syntax check + boot smoke test
cd backend && node --check index.js && node --check gmail.js && node --check firestore.js && node --check gemini.js
PORT=18080 SESSION_SECRET=test node index.js &   # then:
curl -s http://localhost:18080/health             # expect {"status":"ok",...}
curl -s -o /dev/null -w "%{http_code}" http://localhost:18080/api/config  # expect 401
kill %1

# Frontend: production build must pass
cd frontend && npm ci && npm run build
```

There is currently **no test suite** (see `SCALE-8` which adds one). Until it exists,
the checks above plus manual reasoning are the bar.

---

## Context

### What the app is

SpendLens is a personal-finance web app for a Singapore household. It signs a user in
with Google, reads the user's Gmail for bank transaction-alert emails (DBS, UOB, SCB,
Citibank, HSBC, Maybank, AMEX), parses them into structured transactions with Gemini
(`gemini-2.5-flash`), stores them in Firestore, and shows dashboards: monthly spend,
budgets, per-card and per-category breakdowns, transaction list with manual category
editing, and a retirement/net-worth projection tab. Mobile-first PWA.

### Stack & deployment

| Layer     | Tech                                                                  |
|-----------|-----------------------------------------------------------------------|
| Frontend  | React 18 + Vite, Tailwind (v4 via `@tailwindcss/vite`), lucide-react, recharts (lazy-loaded, Retirement only), HashRouter |
| Backend   | Node.js + Express (`backend/index.js`), no framework beyond Express    |
| Data      | Firestore (database id `spendlens`), accessed server-side via Admin SDK — clients never talk to Firestore directly |
| AI        | Gemini `gemini-2.5-flash` REST API for email → transaction parsing     |
| Auth      | Google Identity Services **auth-code popup flow** → backend exchanges code for refresh token (stored in Firestore `gmailAuth/{email}`) and issues its own 90-day JWT (`SESSION_SECRET`), stored in `localStorage` as `spendlens_token`, sent as `Authorization: Bearer` |
| Hosting   | Docker (multi-stage: Vite build → static files served by Express) on **Cloud Run**, region `asia-southeast1`, deployed by Cloud Build (`cloudbuild.yaml`); secrets from Secret Manager |
| Sync cron | Cloud Scheduler hits `POST /api/cron/sync` with `x-cron-key: $CRON_SECRET` |
| Previews  | Netlify builds a frontend-only deploy preview per PR (no backend — API calls fail there; use it for visual checks only) |

### Repository layout

```
backend/
  index.js       Express app: middleware, auth, ALL routes, runUserSync() sync engine
  gmail.js       Gmail REST: fetchEmailIds (search), fetchEmailDetails (fetch + MIME → text)
  gemini.js      parseEmails(): DBS regex fast-path (parseKnownEmail) + Gemini batch prompt
  firestore.js   All Firestore access + getBillingMonth() billing-cycle math
  scripts/       One-off local maintenance scripts (clear_firestore.js, sync_data.js)
frontend/src/
  App.jsx        Auth flow, month/viewBy state, routing shell, Retirement chunk prefetch
  api.js         fetch wrapper (adds JWT, 401 → force re-login), one function per endpoint
  apiCache.js    Session-scoped stale-while-revalidate cache for GET responses
  components/NavBar.jsx
  views/         Overview.jsx, Transactions.jsx, Retirement.jsx, Config.jsx, SetupWizard.jsx
  utils/         dateUtils.js (billing month math, mirrors backend), retirement.js (projection)
Dockerfile, cloudbuild.yaml, README.md
```

### Firestore data model

```
transactions/{userId}/records/{emailId}   ← doc id IS the Gmail message id (see BUG-1)
    { emailId, date "YYYY-MM-DD", amount, amountLocal, currency, isLocal,
      merchant, category, card, type "CHARGE", month "YYYY-MM" (billing),
      calendarMonth "YYYY-MM" }
budgets/{userId}/monthly/{YYYY-MM}        { overall, byCard{}, byCategory{} }
syncState/{userId}                        { lastSyncedAt ISO, oldestSyncedMonths,
                                            progress {stage, current, total} | null,
                                            syncError | null, lastEmailId (legacy, unused) }
settings/{userId}                         { localCurrency, syncPeriodMonths, cards[{id,name,bank,startDay}],
                                            billingCycles{cardName→day}, cardAliases{}, setupComplete }
gmailAuth/{email}                         { refreshToken, updatedAt }
retirement/{userId}                       { plan{}, nw{}, snapshots[{date, netWorth, retireAssets}] }
```

`userId` = the user's Google email. Only `type === 'CHARGE'` transactions are stored
today; `PAYMENT` and `AUTH_HOLD` are parsed but discarded (see FEAT-7).

### API surface (all under `/api`, JWT required except `auth/google`, `cron/sync`)

```
POST /auth/google        {code} → {token, email}      exchanges GIS auth code, mints session JWT
POST /sync               {cardId?} → {started:true}   fire-and-forget runUserSync (see BUG-2)
POST /cron/sync          header x-cron-key            syncs every user in gmailAuth, sequentially
POST /setup              wizard config → settings
GET  /transactions?month=YYYY-MM&viewBy=billing|calendar
POST /transactions/update {emailId, category?, merchant?}
GET  /summary?month&viewBy   → {totalSpend, byCard, byCategory, topMerchants}  (scans month's records)
GET/POST /budget, /config, /retirement, /retirement/snapshot
GET  /syncstate          polled by frontend every 2s during a sync
GET  /health
```

### How a sync works (after PR #6)

`runUserSync(userId, {cardId?})` in `backend/index.js`:

1. In parallel: mint Gmail access token from stored refresh token, read `syncState`,
   read `settings`.
2. If `cardId` given: wipe that card's records (chunked 500/batch) and force a full
   windowed re-search of just that card's bank (partial sync).
3. Write `progress {stage:"fetching"}`; kick off `getProcessedEmailIds` (all record doc
   ids as a Set) and FX-rate fetch (frankfurter.app, 24h in-memory cache) in parallel.
4. Gmail search, all banks concurrently, one query per bank
   (`subject:(transaction OR ...) from:(<bank domains>)`):
   - Incremental (has `lastSyncedAt`): `after:<epoch of lastSyncedAt − 1h>`.
   - First run / card resync: `newer_than:<syncPeriodMonths>m`.
   - Historical backfill (user increased sync window): `newer_than:Xm older_than:Ym`,
     concurrent with the active search.
5. Dedupe ids, drop already-processed ones. If none left → finalize state and exit.
6. Batches of 10 emails through a 3-wide worker pool: fetch email bodies (parallel per
   batch) → `parseEmails` (DBS regex fast-path, rest to one Gemini call per batch) →
   FX-convert to `amountLocal` → save CHARGEs → update `progress {stage:"parsing"}`.
7. Finalize: `lastSyncedAt = sync START time`, `oldestSyncedMonths = max(old, window)`,
   `progress: null`, `syncError: null`. On any error: `progress: null, syncError: msg`.

Frontend triggers `/api/sync` automatically from Overview when `lastSyncedAt` is
missing or > 6h old, then polls `/api/syncstate` every 2s until `progress === null`.

### Frontend caching model (added in PR #6)

`frontend/src/apiCache.js` is a session-scoped `Map`. Views seed state from it
synchronously (instant render) then refetch in the background and rewrite it.
Cache keys in use: `config`, `transactions:{month}:{viewBy}`, `summary:{month}:{viewBy}`,
`budget:{month}`, `retirement`. Invalidation: any successful `postJson` clears the whole
cache; sync completion clears it; sign-out clears it. Form views (Config, Retirement)
deliberately do NOT re-apply background refetch results over in-progress edits.

---

## History (what has happened so far)

| PR | Branch | Summary |
|----|--------|---------|
| #1 | `de3fdd5` | Replaced single-file prototype with the full-stack app (React+Vite frontend, Express backend, Firestore, Gemini parsing, Cloud Run deploy). |
| #2 | `retirement` | Added Retirement tab: plan inputs, net-worth fields, CPF-aware projection chart, monthly snapshots. |
| #3 | `bug-fixes` | Fixed session expiry handling, fake default data, stale FX rates. |
| #4 | `ux-improvements` | Mobile month nav, transaction category editing, PWA support, visual polish. |
| #5 | `server-auth` | Moved auth server-side: GIS auth-code flow, refresh tokens in Firestore, 90-day JWT sessions, `/api/cron/sync` for Cloud Scheduler. |
| #6 | `claude/syncing-latency-improvements-a5jf1h` (**draft, open**) | Sync latency + perceived latency. Backend: incremental sync switched from a broken email-ID pagination marker (every bank whose stream lacked the marker re-scanned its ENTIRE mailbox each sync) to a Gmail `after:<timestamp>` query; per-bank searches parallelized; prep reads parallelized; 3-wide fetch+parse worker pool; sync-start-time marker with 1h overlap; syncError lifecycle fixed; card wipes chunked to Firestore's 500-op limit. Frontend: `apiCache.js` stale-while-revalidate cache (no more spinner on every tab/month switch), removed the "$0.00 / 0 transactions" flash, Retirement chunk prefetch after sign-in. |

A screen recording (July 2026, iPhone) drove PR #6: it showed the Transactions tab
flashing "$0.00 / 0 transactions in view" before data arrived, Retirement stuck on
"Loading…", and Settings ending on a "LOADING SETTINGS" spinner — every tab refetched
everything on every visit.

---

## P0 — Correctness bugs (fix first)

### BUG-1 — Multi-transaction emails silently lose transactions
- **Priority:** P0 · **Effort:** M · **Files:** `backend/firestore.js`, `backend/index.js`
- **Problem:** `saveTransactions` uses `doc(txn.emailId)` as the document id. When one
  email contains two or more transactions (e.g. a daily digest alert, or Gemini's
  dedup rule returning several), each subsequent transaction **overwrites** the
  previous one — only the last survives.
- **Steps:**
  1. In `saveTransactions` (backend/firestore.js), group incoming `transactions` by
     `emailId`. For each group, doc id = `emailId` for index 0, `` `${emailId}__${i}` ``
     for i ≥ 1. Store the plain `emailId` field unchanged on every doc (it already is).
  2. `getProcessedEmailIds` currently returns doc ids. Keep it, but strip suffixes so
     the skip-check still works: `new Set(snapshot.docs.map(d => d.id.split('__')[0]))`.
  3. `updateTransactionsBatch` and the `/api/transactions/update` route key edits by
     `emailId`. Category edits must target the exact record: add the doc id to the data
     returned by `getTransactions` (map `doc => ({ ...doc.data(), _docId: doc.id })`),
     have the frontend send `_docId` back (Transactions.jsx `handleChangeCategory` —
     pass `item._docId ?? item.emailId`), and use it in `updateTransactionsBatch`.
     Keep accepting plain `emailId` for backward compatibility.
  4. `deleteTransactionsByCard` deletes by query, unaffected.
- **Acceptance:** Simulate `saveTransactions(uid, [a, b])` where `a.emailId === b.emailId`
  (write a tiny throwaway script or reason through the diff): two docs must result.
  Editing the category of the second one must not touch the first. Verification
  commands pass.
- **Pitfalls:** Do NOT change existing doc ids (no migration needed — old single-txn
  docs keep working). Don't break the emailId-based dedup in step 2.

### BUG-2 — Background sync can be starved/killed on Cloud Run
- **Priority:** P0 · **Effort:** S (mitigation) · **Files:** `cloudbuild.yaml`
- **Problem:** `POST /api/sync` responds `{started:true}` immediately and runs
  `runUserSync` **after** the response. On Cloud Run's default settings, CPU is
  throttled to near-zero once the response is sent, so the background sync can stall
  or die mid-run (symptoms: syncs that never finish, progress stuck). It works today
  only when another request keeps the instance hot (e.g. the 2s `/syncstate` polling).
- **Steps:**
  1. In `cloudbuild.yaml`, add `--no-cpu-throttling` and `--min-instances=0` (explicit)
     to the `gcloud run deploy` args. `--no-cpu-throttling` keeps CPU allocated between
     requests so fire-and-forget work actually runs. Note the cost implication in the
     PR body (billed per instance-time while an instance is up).
  2. Add a comment above `app.post('/api/sync', ...)` in `backend/index.js` noting that
     background work relies on CPU-always-allocated, and that the durable fix is
     `SCALE-3` (Cloud Tasks).
- **Acceptance:** `gcloud run deploy` dry-run of the args is syntactically valid
  (visual check); deploy notes updated. The durable queue-based fix is tracked as SCALE-3.

### BUG-3 — A bank with no domain mapping searches the user's ENTIRE mailbox
- **Priority:** P0 · **Effort:** S · **Files:** `backend/gmail.js`
- **Problem:** In `fetchEmailIds`, if `banks` is non-empty but none map to
  `BANK_DOMAINS` (e.g. a card configured with a custom/unknown bank string), the
  `from:` clause is silently dropped and the query becomes a subject-only search across
  ALL mail — huge, slow, and floods Gemini with junk (cost + privacy).
- **Steps:**
  1. In `fetchEmailIds`, when `banks.length > 0` and the mapped `domains` list is
     empty, `console.warn` and `return []` — never fall through to the broad query.
  2. The no-banks fallback (`banks` empty → all domains) stays as-is.
- **Acceptance:** `fetchEmailIds(token, { banks: ['NotARealBank'] })` returns `[]`
  without calling the Gmail API (reason through the code path). Verification commands pass.

---

## P1 — Reliability & resilience

### REL-1 — Retry with backoff for Gmail/Gemini calls; don't abort the whole sync on one bad batch
- **Priority:** P1 · **Effort:** M · **Files:** `backend/gmail.js`, `backend/gemini.js`, `backend/index.js`
- **Problem:** One 429/5xx from Gmail or Gemini rejects the batch, sets `aborted=true`
  and kills the entire sync. No retries anywhere. Gemini free-tier 429s are common.
- **Steps:**
  1. Add a small helper (new file `backend/retry.js`):
     `async function withRetry(fn, {retries = 3, baseMs = 2000})` — retry on any error
     whose `err.response?.status` is 429 or ≥ 500 (and network errors with no
     response), sleeping `baseMs * 2^attempt`, else rethrow immediately.
  2. Wrap the axios calls in `fetchEmailIds`, `fetchEmailDetails` (gmail.js) and the
     Gemini `axios.post` (gemini.js) with `withRetry`.
  3. In `runUserSync`'s `processBatches` loop (index.js), change the per-batch `catch`:
     instead of `aborted = true; throw err`, record the failed batch's email ids into a
     local `failedEmailIds` array, `console.error`, and CONTINUE with the next batch.
     After the pool finishes: if `failedEmailIds.length > 0`, include
     `syncError: \`${failedEmailIds.length} emails failed to parse; they will be retried next sync\``
     in the final `saveSyncState` and do NOT advance `lastSyncedAt` past... — keep it
     simple: leave `lastSyncedAt = syncStartedAt` anyway; failed emails are still
     unprocessed (no Firestore record) BUT the timestamp window will skip them next
     incremental sync. To make retry real, also persist `failedEmailIds` (capped at 200)
     in syncState and prepend them to `newEmailIds` on the next run, then clear.
- **Acceptance:** Force a fake 429 (temporarily point the Gemini URL at an invalid
  path in a local test) → sync completes, other batches saved, `syncState.syncError`
  mentions the failed count, `syncState.failedEmailIds` populated; next sync picks them
  up. Remove the fake before committing. Verification commands pass.
- **Pitfalls:** Keep total added latency bounded (3 retries max). Don't retry 4xx
  other than 429.

### REL-2 — Prevent concurrent syncs for the same user
- **Priority:** P1 · **Effort:** S · **Files:** `backend/index.js`
- **Problem:** "Sync Now" + the 6-hour auto-trigger + Cloud Scheduler can run
  `runUserSync` for the same user simultaneously: duplicate Gemini spend, interleaved
  progress writes, confusing UI.
- **Steps:**
  1. At the top of `runUserSync` (after reading `syncState`), if
     `syncState.progress` exists AND `syncState.progressUpdatedAt` is < 10 minutes old,
     log and return immediately (another sync is live).
  2. Write `progressUpdatedAt: new Date().toISOString()` alongside every `progress`
     write (there are 4 call sites — search `progress: {` in index.js).
  3. The 10-minute staleness window means a crashed sync self-heals.
- **Acceptance:** Calling `runUserSync` twice back-to-back results in the second
  returning early (add a temporary console.log to observe, then remove). Verification
  commands pass.

### REL-3 — Truncate email bodies before sending to Gemini
- **Priority:** P1 · **Effort:** S · **Files:** `backend/index.js` (or gemini.js)
- **Problem:** Marketing-heavy HTML emails can be tens of KB after `htmlToText`. A
  batch of 10 can blow past token limits → slow, expensive, or failed Gemini calls.
  Transaction alerts carry their facts in the first couple of KB.
- **Steps:** Where email objects are built in `processBatches`
  (`{ id, subject, body, receivedAt }`), slice: `body: (detail.body || '').slice(0, 4000)`.
  Add a one-line comment stating why.
- **Acceptance:** Verification commands pass; prompt for a batch with a 50KB body
  stays < ~45KB total.

### REL-4 — Add error monitoring and structured logs
- **Priority:** P1 · **Effort:** M · **Files:** `backend/index.js`, `backend/package.json`
- **Problem:** Failures only surface if someone reads Cloud Run stdout. `morgan('combined')`
  is noisy text; sync errors are swallowed into `syncState.syncError` and console.
- **Steps:**
  1. Replace `morgan('combined')` with `morgan('tiny')` in production or a JSON line
     format; keep request logging cheap.
  2. Add a global Express error handler and a `process.on('unhandledRejection')` hook
     that logs `{severity:'ERROR', message, stack}` as JSON (Cloud Logging picks up
     `severity` automatically).
  3. (Optional, if a SENTRY_DSN env var is provided) add `@sentry/node` init guarded by
     the env var — skip entirely if unset.
- **Acceptance:** Throwing inside a route in a local run produces one structured JSON
  error line; app still returns 500 JSON to the client. Verification commands pass.

---

## P2 — Scalability & cost

### SCALE-1 — Materialized monthly summaries (cut Firestore reads)
- **Priority:** P2 · **Effort:** M · **Files:** `backend/firestore.js`, `backend/index.js`
- **Problem:** `GET /api/summary` scans every record in the month on every call (and
  Overview + Retirement both call it). At 150 txns/month that's ~300 doc reads per
  dashboard visit per view. Costs and latency grow linearly with data and users.
- **Steps:**
  1. After each successful sync (and after `/api/transactions/update` and card wipes),
     recompute the summary for the affected month(s) and store it at
     `summaries/{userId}/monthly/{YYYY-MM}` with the same shape `getSummary` returns,
     plus `viewBy` variants: store `{ billing: {...}, calendar: {...} }`.
     Affected months = distinct `month`/`calendarMonth` values in the batch just saved.
  2. `GET /api/summary` reads the summary doc; if missing (legacy data), fall back to
     the current scan and write the doc through.
  3. Keep `getSummary`'s scan implementation as the compute function — reuse it.
- **Acceptance:** Second summary read for a month = exactly 1 doc read (reason through
  code). Editing a transaction's category updates that month's summary doc. Fallback
  path works for a month with no summary doc.
- **Pitfalls:** Update summaries for BOTH the billing month and calendar month of each
  affected transaction; a category edit can only change amounts within the same months.

### SCALE-2 — More regex fast-path parsers to cut Gemini calls
- **Priority:** P2 · **Effort:** M · **Files:** `backend/gemini.js`
- **Problem:** Only DBS card alerts skip Gemini (`parseKnownEmail`). UOB/Citi/SCB alert
  emails are highly templated; every one costs a Gemini call slice today.
- **Steps:**
  1. Collect 2–3 real examples per bank from the user's mailbox (redact) or from the
     existing Firestore records' source emails — if unavailable, implement only banks
     for which a confident template exists and leave TODO markers.
  2. Refactor `parseKnownEmail` into a list of parsers `[parseDbsAlert, parseUobAlert, ...]`,
     first non-null wins. Each returns the same shape (`type: 'CHARGE'` etc.) or null.
     **Null on ANY doubt** — Gemini is the safety net.
  3. Log a counter per sync: `x parsed by regex, y sent to Gemini`.
- **Acceptance:** Unit-test each parser with a fixture string (add tests if SCALE-8 is
  merged; otherwise include fixtures + a tiny assert script under `backend/scripts/`).
  Unknown formats still fall through to Gemini.

### SCALE-3 — Move sync execution to Cloud Tasks (durable jobs)
- **Priority:** P2 (do after BUG-2 mitigation) · **Effort:** L · **Files:** `backend/index.js`, `cloudbuild.yaml`, README
- **Problem:** Fire-and-forget in-process sync dies with the instance; cron loops all
  users sequentially in one request (900s timeout ceiling).
- **Steps:**
  1. Add `POST /api/tasks/sync-user` (auth: `x-cron-key` header, same as cron): body
     `{userId, cardId?}` → awaits `runUserSync` inline and returns 200/500. This is the
     Cloud Tasks target; Tasks retries on 500.
  2. `POST /api/sync` and `/api/cron/sync` enqueue one task per user via
     `@google-cloud/tasks` (queue name from env `SYNC_QUEUE`, e.g.
     `projects/$P/locations/asia-southeast1/queues/spendlens-sync`) instead of running
     inline. If `SYNC_QUEUE` is unset, fall back to the current inline behavior (keeps
     local dev working).
  3. Document queue creation (`gcloud tasks queues create spendlens-sync ...
     --max-concurrent-dispatches=3`) in README.
- **Acceptance:** With `SYNC_QUEUE` unset, behavior is unchanged (local dev). With it
  set, `/api/sync` returns immediately and a task hits `/api/tasks/sync-user`.
  REL-2's lock prevents duplicate concurrent runs either way.

### SCALE-4 — Gmail push notifications instead of polling (later)
- **Priority:** P3 · **Effort:** L · **Files:** backend, infra
- **Problem:** Cron polling wastes quota and delays data up to the cron interval.
- **Sketch (needs design pass before implementation):** `users.watch` per user on a
  Pub/Sub topic → push subscription → endpoint validates, debounces (60s), enqueues a
  sync task for that user. Watch expires every 7 days — renew in the daily cron.
  Depends on SCALE-3. Keep cron as fallback.

### SCALE-8 — Tests + CI pipeline (unlocks safe agent-driven development)
- **Priority:** P2 but HIGH leverage — do early · **Effort:** M · **Files:** new `.github/workflows/ci.yml`, `backend/*.test.js`, `backend/package.json`, `frontend/package.json`
- **Steps:**
  1. Add `vitest` as a devDependency of `backend/` (works for plain CommonJS).
     `"test": "vitest run"`.
  2. Extract pure functions so they're importable without side effects (they already
     are: `getBillingMonth` from firestore.js — note requiring firestore.js
     instantiates the Firestore client; move `getBillingMonth` to a new
     `backend/billing.js`, re-export from firestore.js for compatibility).
  3. Write unit tests: `getBillingMonth` (closing-day boundaries, month rollover,
     Dec→Jan, invalid date), `htmlToText`, `extractBodyFromParts` (nested parts),
     `parseKnownEmail` (DBS fixture), `extractJsonArray` (clean JSON, fenced JSON,
     garbage → throws).
  4. GitHub Actions workflow: on PR — `node --check` all backend files, backend
     `npm test`, frontend `npm ci && npm run build`.
- **Acceptance:** CI runs green on the PR that adds it; a deliberately broken test
  fails the workflow (verify once locally, then fix).

---

## P2/P3 — Features (value)

### FEAT-1 — Merchant → category rules ("always categorize Grab as Transport")
- **Priority:** P2 · **Effort:** M · **Files:** `backend/index.js`, `backend/firestore.js`, `frontend/src/views/Transactions.jsx`
- **Why:** Users repeatedly fix the same merchant's category; corrections currently
  apply to one transaction only. This is the single biggest data-quality win.
- **Steps:**
  1. Store rules in `settings/{userId}.categoryRules` as `{ [merchantLower]: category }`.
  2. `/api/transactions/update`: accept `applyToMerchant: true`. When set: save the
     rule, then batch-update ALL existing records where `merchant` matches
     (case-insensitive compare in code after a `getAllTransactions` read — data is
     small), and recompute affected summary docs if SCALE-1 is merged.
  3. In `runUserSync`, after parsing, apply rules: `txn.category = rules[merchant.toLowerCase()] ?? txn.category`.
  4. UI (Transactions.jsx): after picking a category in the edit panel, show a small
     inline prompt: "Apply to all NN 'Grab' transactions and future syncs?" with
     Yes/No. Yes → resend with `applyToMerchant: true`.
- **Acceptance:** Setting a rule updates existing records and future syncs honor it;
  a normal single edit still works with no rule created.

### FEAT-2 — Store PAYMENT and AUTH_HOLD types; show refunds/payments
- **Priority:** P2 · **Effort:** M · **Files:** `backend/index.js`, `backend/firestore.js`, `frontend/src/views/Transactions.jsx`, `Overview.jsx`
- **Why:** Refunds and bill payments are parsed then thrown away; spend totals
  overstate reality and users can't verify card payments landed.
- **Steps:**
  1. In `runUserSync`, save `parsed.filter(t => t.type === 'CHARGE' || t.type === 'PAYMENT')`
     (keep discarding AUTH_HOLD).
  2. Everywhere totals are computed (`getSummary`, Transactions hero/`totalFiltered`,
     group totals), include only CHARGE. PAYMENTs render in the list with a green
     +amount (the UI already renders negative amounts green — instead key off
     `t.type === 'PAYMENT'`).
  3. Add a "Payments" filter chip in the Transactions category dropdown.
- **Acceptance:** Spend totals unchanged by PAYMENT rows; payments visible and
  filterable. Old data (no payments stored) unaffected.
- **Pitfalls:** `getProcessedEmailIds` already prevents re-import of past payment
  emails ONLY if those emails previously produced a stored record — they didn't. After
  this ships, the next incremental sync window (1h overlap) won't re-fetch old
  payment emails; that's fine — document that payments appear from ship-date forward.

### FEAT-3 — Recurring/subscription detection
- **Priority:** P2 · **Effort:** M · **Files:** `backend/index.js` (new endpoint), `frontend/src/views/Overview.jsx` or new view
- **Sketch:** Endpoint `GET /api/subscriptions`: group all transactions by merchant;
  flag merchants appearing in ≥ 3 distinct months with amount variance < 15%. Return
  `{merchant, avgAmount, months, lastDate, category}` list. UI: "Subscriptions" card on
  Overview (monthly total + list). No schema change. Compute server-side from
  `getAllTransactions` (cheap at current scale; revisit with SCALE-1 data).

### FEAT-4 — Month-over-month insights on Overview
- **Priority:** P3 · **Effort:** S–M · **Files:** `frontend/src/views/Overview.jsx`, `backend` (summary for prev month)
- **Sketch:** Fetch previous month's summary alongside current (cache makes this
  cheap); show deltas: total vs last month, top 3 category movers (▲▼ %). Keep it
  purely presentational.

### FEAT-5 — CSV export
- **Priority:** P3 · **Effort:** S · **Files:** `frontend/src/views/Transactions.jsx`
- **Sketch:** "Export CSV" button; serialize the CURRENT filtered list client-side
  (date, merchant, category, card, amount, currency, amountLocal) via a Blob download.
  No backend work.

### FEAT-6 — Persist cache to localStorage for instant cold starts
- **Priority:** P3 · **Effort:** S · **Files:** `frontend/src/apiCache.js`, `frontend/src/App.jsx`
- **Sketch:** Mirror `writeCache` into `localStorage` (`spendlens_cache_v1`, JSON,
  ~size-capped), hydrate the Map on boot, clear on sign-out (already calls
  `clearApiCache`) and on 401. Namespace by user email to avoid cross-account leaks
  (email is available from the JWT payload — decode client-side or store alongside token).

### FEAT-7 — Replace recharts with hand-rolled SVG charts
- **Priority:** P3 · **Effort:** M · **Files:** `frontend/src/views/Retirement.jsx`, `frontend/src/App.jsx`
- **Why:** The lazy Retirement chunk is 411 kB (112 kB gz) — nearly 2× the main bundle
  — for two simple charts. Overview already hand-rolls an SVG donut; do the same for
  the area/line projection charts (axes: 4 ticks, path from points, dashed target
  line, filled area). Remove `recharts` dependency and the chunk prefetch special-case.
- **Acceptance:** `npm run build` shows Retirement chunk < 50 kB; charts visually
  match (screenshot in PR).

### FEAT-8 — Budget alerts (in-app + PWA push)
- **Priority:** P3 · **Effort:** L · **Sketch:** After each sync, compare month spend
  vs budget; at 80%/100% thresholds write an `alerts` subdoc once per month-threshold;
  Overview shows a banner. Web Push (VAPID + service worker) is a follow-up — separate
  design pass; do not bundle into the first cut.

### FEAT-9 — Household sharing (two Googles, one ledger)
- **Priority:** P3/backlog · **Effort:** XL · Needs a design pass: a `households`
  collection mapping member emails → shared ledger id, all data keyed by ledger id
  instead of email, invite flow. Touches every Firestore path — do NOT attempt as a
  side task; schedule dedicated work with migration script.

---

## UX polish backlog (small, safe tasks — good warm-ups for an agent)

- **UX-1** Skeleton placeholders (shimmering card shapes) instead of spinners for the
  cold-load states in Transactions/Overview/Config. Pure CSS + conditional render.
- **UX-2** `viewBy` toggle currently snaps `currentMonth` back to today
  (`App.jsx` effect on `viewBy`). Preserve the browsed month instead: convert the
  currently viewed month between billing/calendar rather than resetting. Small logic
  change in that effect; use `lastViewBy.current` (already tracked, currently unused).
- **UX-3** Cancel stale fetches on rapid month navigation in Transactions/Overview: add
  a `cancelled` flag (the `useEffect` cleanup pattern already used in App.jsx) so a slow
  older response can't overwrite a newer one.
- **UX-4** Show `syncState.syncError` on Overview when present (it's stored but never
  rendered) — small red banner with a Retry button that calls `handleSync`.
- **UX-5** Empty-state CTA: when a month has 0 transactions and user has 0 cards
  configured, deep-link to Settings → cards instead of the generic "No transactions found".

---

## Security notes (review before public/multi-user launch)

- JWT lives in `localStorage` (XSS-readable). Helmet CSP mitigates. Proper fix:
  httpOnly SameSite cookie session — medium refactor of `api.js` + auth middleware +
  CORS; schedule deliberately, don't drive-by.
- `gmailAuth` stores Gmail **refresh tokens** in Firestore plaintext. Consider
  encrypting with a KMS key or at minimum locking the collection down via IAM (it is
  server-only today; document that assumption).
- Rate limiter is per-IP (100 req/15 min/IP); fine for household use, revisit for
  multi-user (keyed by userId post-auth).
- `/api/cron/sync` and future `/api/tasks/*` share `CRON_SECRET`; rotate it if ever
  leaked, and prefer OIDC-authenticated Cloud Tasks/Scheduler invocations when SCALE-3
  lands.

---

## Suggested sequencing

```
Wave 1 (correctness):        BUG-1, BUG-2, BUG-3
Wave 2 (safety net):         SCALE-8 (tests+CI), REL-1, REL-2, REL-3
Wave 3 (cost/perf):          SCALE-1, SCALE-2, REL-4
Wave 4 (value):              FEAT-1, FEAT-2, FEAT-3, UX-1..UX-5
Wave 5 (scale-out, design):  SCALE-3 → SCALE-4, FEAT-6..FEAT-8
Backlog (needs design):      FEAT-9, cookie sessions
```

One task per PR. After each wave, re-read this file and strike out what shipped —
keep the History table current so future agents inherit accurate context.
