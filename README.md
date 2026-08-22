# Golden Crow Website

Monorepo containing the Golden Crow marketing site, backoffice admin dashboard, public OpenAPI route layer, and internal backend SDK.

## Live URLs

| App | URL |
|-----|-----|
| Website | https://goldencrowvs.com |
| Backoffice | https://golden-crow-backoffice.vercel.app |
| SDK | https://golden-crow-sdk.vercel.app/health |
| Public OpenAPI | https://golden-crow-backoffice.vercel.app/open-api/openapi.json |

## Project Structure

```
golden-crow-website/
├── pocket-genes/      # Astro static marketing site (GitHub Pages)
├── backoffice/        # Next.js 16 admin dashboard and /open-api routes (Vercel)
├── goldencrow-sdk/    # Internal Fastify service wrapping Firebase Admin (Vercel)
└── .github/workflows/ # CI/CD for GitHub Pages
```

## Prerequisites

- Node.js 18+
- npm

## Local Development

Run the services you need in separate terminals:

```bash
# Terminal 1 — SDK (must start first)
cd goldencrow-sdk
npm install
npm run dev
# Runs on http://localhost:3000

# Terminal 2 — Backoffice and public /open-api routes
cd backoffice
npm install
npm run dev
# Runs on http://localhost:3001

# Terminal 3 — Website (optional)
cd pocket-genes
npm install
npm run dev
# Runs on http://localhost:4321
```

## Environment Variables

### goldencrow-sdk/.env

| Variable | Value |
|----------|-------|
| `FIREBASE_ADMIN_PROJECT_ID` | `goldencrow-pocketgenes` |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | `firebase-adminsdk-fbsvc@goldencrow-pocketgenes.iam.gserviceaccount.com` |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Firebase service account private key |
| `FIREBASE_WEB_API_KEY` | `AIzaSyCTiL_RwICvnngYEqE721_MwVmDqGyYZ64` |
| `TEAM_ALLOWLIST` | Comma-separated admin emails |
| `PORT` | `3000` (local) |
| `NODE_ENV` | `development` (local) / `production` (Vercel) |
| `BACKOFFICE_ORIGIN` | `http://localhost:3001` (local) / `https://golden-crow-backoffice.vercel.app` (Vercel) |
| `GOLDENCROW_OPENAPI_INTERNAL_TOKEN` | Shared service token also configured in `backoffice` for `/open-api` routes |

### backoffice/.env.local

| Variable | Value |
|----------|-------|
| `NEXTAUTH_URL` | `http://localhost:3001` (local) / `https://golden-crow-backoffice.vercel.app` (Vercel) |
| `NEXTAUTH_SECRET` | Generate with `openssl rand -base64 32` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSyCTiL_RwICvnngYEqE721_MwVmDqGyYZ64` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `goldencrow-pocketgenes.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `goldencrow-pocketgenes` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `goldencrow-pocketgenes.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `355295584619` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:355295584619:web:1b3eb5bd34a4cc03da6c2e` |
| `NEXT_PUBLIC_SDK_URL` | `http://localhost:3000` (local) / `https://golden-crow-sdk.vercel.app` (Vercel, no trailing slash) |
| `GOLDENCROW_SDK_URL` | `http://localhost:3000` (local) / `https://golden-crow-sdk.vercel.app` (Vercel, no trailing slash) |
| `REPORTING_API_TOKEN` | External bearer token accepted by `/open-api/*` routes |
| `BACKOFFICE_REPORTING_API_TOKEN` | Optional server-only override for the full-admin API key reveal UI |
| `GOLDENCROW_OPENAPI_INTERNAL_TOKEN` | Shared service token used by `/open-api/*` routes to call the SDK internal bridge |

Copy from the `.env.example` / `.env.local.example` files and fill in the values.

## Deployment

### Website (pocket-genes)
Deployed automatically to **GitHub Pages** on push to `main` via `.github/workflows/deploy.yml`.

### Backoffice & SDK
Deployed on **Vercel** as separate projects from the same repo:
- Backoffice: root directory set to `backoffice`; serves both dashboard pages and public `/open-api/*` routes
- SDK: root directory set to `goldencrow-sdk`

Set the environment variables listed above in each Vercel project's settings. Make sure service URLs have **no trailing slash**.

### Firebase Setup
Add `golden-crow-backoffice.vercel.app` and `golden-crow-sdk.vercel.app` to Firebase Console > Authentication > Settings > Authorized domains.
