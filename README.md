# SpendLens

SpendLens is a React + Express app that signs users in with Google, reads Gmail transaction emails, parses them with Gemini, stores results in Firestore, and serves the dashboard from Cloud Run.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: Firestore
- Auth: Google Identity Services
- Hosting: Cloud Run
- CI/CD: Cloud Build

## Local setup

### 1. Create env files

`frontend/.env`

```bash
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

`backend/.env`

```bash
PORT=8080
GEMINI_API_KEY=your-gemini-api-key
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
FIRESTORE_DATABASE_ID=spendlens
```

### 2. Install dependencies

```bash
cd frontend
npm install

cd ../backend
npm install
```

### 3. Start the app locally

Frontend:

```bash
cd frontend
npm run dev
```

Backend:

```bash
cd backend
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies `/api` to `http://localhost:8080`.

## Google OAuth setup

Create a Web OAuth client in Google Cloud Console and make sure these Authorized JavaScript origins are present:

- `http://localhost:5173`
- Your deployed Cloud Run origin, for example `https://spendlens-446381050629.asia-southeast1.run.app`

If the deployed popup opens and immediately closes, verify the exact Cloud Run origin is listed here.

## GCP prerequisites

Before deployment, make sure your Google Cloud project has:

- Cloud Run API enabled
- Cloud Build API enabled
- Firestore API enabled
- Gmail API enabled
- A Firestore database created
- Secret Manager secrets for `GEMINI_API_KEY` and `GOOGLE_CLIENT_ID`

## Deployment

This repo is already wired for Cloud Build in [cloudbuild.yaml](/Users/noel/Documents/Projects/SpendLens/cloudbuild.yaml).

### What the pipeline does

1. Writes `frontend/.env.production` with `VITE_GOOGLE_CLIENT_ID` from Secret Manager
2. Builds the Docker image
3. Pushes the image to Artifact/Container Registry as `gcr.io/$PROJECT_ID/spendlens`
4. Deploys the image to Cloud Run service `spendlens` in `asia-southeast1`
5. Injects `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, and `FIRESTORE_DATABASE_ID=spendlens`

### One-time setup

Set your gcloud project:

```bash
gcloud config set project spendlens-492305
```

Create the required secrets if they do not already exist:

```bash
printf '%s' 'your-gemini-api-key' | gcloud secrets create GEMINI_API_KEY --data-file=-
printf '%s' 'your-google-oauth-client-id.apps.googleusercontent.com' | gcloud secrets create GOOGLE_CLIENT_ID --data-file=-
```

If the secrets already exist, add a new version instead:

```bash
printf '%s' 'your-gemini-api-key' | gcloud secrets versions add GEMINI_API_KEY --data-file=-
printf '%s' 'your-google-oauth-client-id.apps.googleusercontent.com' | gcloud secrets versions add GOOGLE_CLIENT_ID --data-file=-
```

Grant Cloud Build access to the secrets if needed:

```bash
PROJECT_NUMBER="$(gcloud projects describe spendlens-492305 --format='value(projectNumber)')"
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding GOOGLE_CLIENT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Deploy with Cloud Build

From the repo root:

```bash
cd /Users/noel/Documents/Projects/SpendLens
gcloud builds submit --config cloudbuild.yaml .
```

### Verify the deployment

Get the deployed URL:

```bash
gcloud run services describe spendlens \
  --region asia-southeast1 \
  --format='value(status.url)'
```

Check the response headers:

```bash
curl -I "$(gcloud run services describe spendlens --region asia-southeast1 --format='value(status.url)')"
```

For Google popup auth, the response should include:

- `Cross-Origin-Opener-Policy: same-origin-allow-popups`

## Auth troubleshooting

### `popup_closed`

Usually means one of these:

- The user manually closed the Google popup
- The browser blocked the popup
- The OAuth client is missing the deployed Cloud Run origin
- The app is served with a popup-hostile `Cross-Origin-Opener-Policy`

This repo now sets the required popup-friendly policy in [backend/index.js](/Users/noel/Documents/Projects/SpendLens/backend/index.js#L22).

### `popup_failed_to_open`

The browser blocked the popup. Allow popups for the site and try again.

### Signed in, but API calls fail with `401`

Check that:

- `GOOGLE_CLIENT_ID` in Cloud Run matches the frontend `VITE_GOOGLE_CLIENT_ID`
- Gmail API is enabled
- The user granted the requested Gmail scope

## Relevant files

- [cloudbuild.yaml](/Users/noel/Documents/Projects/SpendLens/cloudbuild.yaml)
- [Dockerfile](/Users/noel/Documents/Projects/SpendLens/Dockerfile)
- [backend/index.js](/Users/noel/Documents/Projects/SpendLens/backend/index.js)
- [frontend/src/App.jsx](/Users/noel/Documents/Projects/SpendLens/frontend/src/App.jsx)
