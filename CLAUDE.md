# SpendLens — agent instructions

**Always read `build-plan.md` before doing anything in this repository.**

It is the single source of truth: architecture, Firestore data model, sync-pipeline
internals, API surface, project history, known bugs, and the prioritized task backlog.
Every task there is a self-contained card (files, steps, acceptance criteria, pitfalls).

Rules:

1. Work from `build-plan.md` task cards. Follow its "How to use this document" section
   and run its verification commands before every commit.
2. One task = one branch = one PR. Touch only the files a card lists unless a step
   says otherwise. No drive-by refactors or dependency upgrades.
3. If your task isn't in the plan, add a task card for it in the matching section
   (same format) as part of your PR.
4. When a task ships, update the plan: strike it out or mark it done, and keep the
   History table current so future agents inherit accurate context.

Quick verification (details in build-plan.md):

```bash
cd backend && node --check index.js && node --check gmail.js && node --check firestore.js && node --check gemini.js
cd frontend && npm ci && npm run build
```
