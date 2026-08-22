# Golden Crow Website

Monorepo containing the Golden Crow marketing site, backoffice admin dashboard, internal backend SDK, and public OpenAPI service.

## Live URLs

| App | URL |
|-----|-----|
| Website | https://goldencrowvs.com |
| Backoffice | https://golden-crow-backoffice.vercel.app |
| SDK | https://golden-crow-sdk.vercel.app/health |
| Public OpenAPI | https://goldencrow-openapi.vercel.app/openapi.json |

## Project Structure

```
golden-crow-website/
├── pocket-genes/      # Astro static marketing site (GitHub Pages)
├── backoffice/        # Next.js 16 admin dashboard (Vercel)
├── goldencrow-sdk/    # Internal Fastify service wrapping Firebase Admin (Vercel)
├── goldencrow-openapi/ # Public versioned OpenAPI service for external integrations (Vercel)
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

# Terminal 2 — Public OpenAPI (optional unless testing external integrations)
cd goldencrow-openapi
npm install
npm run dev
# Runs on http://localhost:4010

# Terminal 3 — Backoffice
cd backoffice
npm install
npm run dev
# Runs on http://localhost:3001

# Terminal 4 — Website (optional)
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
| `GOLDENCROW_OPENAPI_INTERNAL_TOKEN` | Shared service token also configured in `goldencrow-openapi` |

### goldencrow-openapi/.env

| Variable | Value |
|----------|-------|
| `GOLDENCROW_OPENAPI_PUBLIC_URL` | `http://localhost:4010` (local) / `https://goldencrow-openapi.vercel.app` (Vercel, no trailing slash) |
| `GOLDENCROW_SDK_URL` | `http://localhost:3000` (local) / `https://golden-crow-sdk.vercel.app` (Vercel, no trailing slash) |
| `GOLDENCROW_OPENAPI_INTERNAL_TOKEN` | Same shared service token configured in `goldencrow-sdk` |
| `REPORTING_API_TOKEN` | External bearer token issued to reporting integration clients |

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
| `GOLDENCROW_OPENAPI_URL` | `http://localhost:4010` (local) / `https://goldencrow-openapi.vercel.app` (Vercel, no trailing slash) |
| `BACKOFFICE_REPORTING_API_TOKEN` | Optional server-only override for the full-admin API key reveal UI |

Copy from the `.env.example` / `.env.local.example` files and fill in the values.

## Deployment

### Website (pocket-genes)
Deployed automatically to **GitHub Pages** on push to `main` via `.github/workflows/deploy.yml`.

### Backoffice, SDK & Public OpenAPI
Deployed on **Vercel** as separate projects from the same repo:
- Backoffice: root directory set to `backoffice`
- SDK: root directory set to `goldencrow-sdk`
- Public OpenAPI: root directory set to `goldencrow-openapi`

Set the environment variables listed above in each Vercel project's settings. Make sure service URLs have **no trailing slash**.

### Firebase Setup
Add `golden-crow-backoffice.vercel.app` and `golden-crow-sdk.vercel.app` to Firebase Console > Authentication > Settings > Authorized domains.
