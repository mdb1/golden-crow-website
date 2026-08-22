# GoldenCrow OpenAPI

Public Vercel API for selected external GoldenCrow integrations.

This service owns the external contract:

- Versioned public paths, currently `/v1/reporting/*`
- External bearer token validation with `REPORTING_API_TOKEN`
- `/openapi.json` as the source of truth for public API documentation

It does not read Firestore directly. It calls the internal `goldencrow-sdk`
bridge routes with `GOLDENCROW_OPENAPI_INTERNAL_TOKEN`; the SDK remains the
Firebase service layer used by internal applications.

## Environment Variables

| Variable | Description |
| --- | --- |
| `GOLDENCROW_OPENAPI_PUBLIC_URL` | Public base URL for generated OpenAPI examples, for example `https://goldencrow-openapi.vercel.app` |
| `GOLDENCROW_SDK_URL` | Internal SDK base URL, for example `https://golden-crow-sdk.vercel.app` |
| `GOLDENCROW_OPENAPI_INTERNAL_TOKEN` | Shared service token used only between `goldencrow-openapi` and `goldencrow-sdk` |
| `REPORTING_API_TOKEN` | External bearer token issued to reporting integration clients |

## Local Development

```bash
cd goldencrow-openapi
npm install
npm run dev
```

The public API runs on `http://localhost:4010` by default.
