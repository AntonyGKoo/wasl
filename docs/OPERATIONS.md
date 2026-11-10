# Running and deploying Wasl

## Local setup

Use Node 24 LTS, run `npm ci`, then `npm run dev`. Register a new account in the browser; passwords require at least 10 characters. The initial request creates a persistent PostgreSQL database under `.wasl-data/`. This is real server-side storage, not browser localStorage or a fixture repository.

The local fallback uses PGlite to run PostgreSQL and pgvector without Docker. Keep the directory on durable disk and run only one app process against it. Use hosted PostgreSQL for multiple instances. Database files, `.env.local`, test output, and scratch files are ignored by Git.

The development launcher enables file polling to work in shared workspaces with limited native file watchers. Extra Next.js flags can be passed through `npm run dev -- --port 3001`.

## OpenAI and Google Cloud Vision

Copy `.env.example` to `.env.local` and add credentials there. Never commit or paste keys into source code.

- `OPENAI_API_KEY`: an OpenAI API project key with API billing or approved credits. A ChatGPT subscription does not provide API credits.
- `OPENAI_MODEL`: an account-enabled model supporting Responses and Structured Outputs. The configurable default is `gpt-4o-mini`.
- `OPENAI_EMBEDDING_MODEL`: defaults to `text-embedding-3-small`, requested at 1536 dimensions. Changing this setting causes saved contacts to be re-embedded as needed.
- `GOOGLE_CLOUD_VISION_API_KEY`: a Google Cloud key restricted to the enabled Vision API.

Restart after changing environment values. Settings reports configured feature availability. A configured key is not proof of a valid account, billing, quota, or model entitlement: test each provider against synthetic or consented data before a pilot.

When no providers are configured, contacts, cards, QR sharing, notes, exports, keyword recall, and paste-text capture work. There is no simulated AI response. AI service failures return a clearly labeled keyword fallback. Photo-scan failures leave manual entry available.

AI recall sends the question and relevant saved context to OpenAI. Returned matches must reference a retrieved contact and contain an exact saved quote. The model has no contact-write tools. Embeddings are cached with the source version, so edited notes cannot be matched through stale vectors. At most 20 missing/changed contact embeddings are refreshed per AI request; keyword candidates remain available while a larger network is indexed.

Card photos are read on the phone with Tesseract.js (files served from `public/ocr`, copied at build time), so the photo never leaves the device. The text is then sorted into fields by `gpt-4o-mini` when `OPENAI_API_KEY` is set, or by built-in rules otherwise; pasted text works the same way. Every scan opens an editable review form before anything is saved. When `GOOGLE_CLOUD_VISION_API_KEY` is set, photos are read by Google Vision instead (validated JPEG/PNG up to 5 MB, with the person's approval for the transfer; processed in memory, not retained).

QR codes are read on the phone with jsQR. A Wasl card link opens that card; a vCard or MECARD code from a paper card becomes a draft contact.

"Use my location" sends coordinates rounded to about 10 m to the server, which looks up a place name from OpenStreetMap's public Nominatim service (identified by the app's URL, at most 30 lookups per person per hour). Nothing about the lookup is stored.

Per-user and project-wide call limits are stored in PostgreSQL and configured in `.env.example`. They limit request counts rather than an exact dollar amount. Configure provider billing alerts and limits separately. Automated tests do not make paid provider calls.

## Hosted PostgreSQL / Supabase

1. Provision PostgreSQL with the `vector` extension, such as a Supabase project.
2. Set the server-only `DATABASE_URL` in `.env.local` to an administrative connection compatible with the host or Supabase pooler.
3. Run `npm run db:migrate`. The migration script loads Next.js environment files and applies every `db/NNN_*.sql` file in order, once each: `001_initial.sql` (extension, tables, indexes, policies, restricted `wasl_member` role) and `002_product.sql` (Team cards, albums, two-way swaps). Hosted migrations are explicit; only the local fallback migrates automatically.
4. Configure `DATABASE_URL`, an HTTPS `APP_URL`, and optional provider credentials on the hosting platform.
5. Deploy as a Next.js Node application. Build: `npm run build`; ordinary Node startup: `npm start`.
6. Verify signup, selected-field sharing, private notes, recall, revocation, and logout using two accounts on the deployed domain.

Prepared statements are disabled for transaction-pooler compatibility. Use `sslmode=verify-full` on the hosted connection URL. If the provider uses a private CA, download its certificate from the provider dashboard and set `DATABASE_CA_CERT` to the PEM contents (literal `\n` sequences are also accepted). This passes the CA to the driver while keeping certificate and hostname verification enabled. Supply the same variable on the hosting platform. Do not add `DATABASE_URL` or other server configuration as a `NEXT_PUBLIC_` variable.

Supabase is supported as the database host. Authentication is application-managed email/password authentication backed by PostgreSQL; Supabase Auth and LinkedIn OIDC are not implemented in this release. The restricted database role is switched transaction-locally after the server verifies a session. RLS, explicit ownership checks, and ownership-bound foreign keys protect private relationships.

The Next.js backend is the only data API. Direct `anon` and `authenticated` PostgREST access to these tables is revoked by the migration. Auth/session tables are never granted to the app's tenant role. Do not weaken those policies to make a browser database client work.

## Vercel and other serverless hosts

Vercel requires a hosted `DATABASE_URL`. The app refuses to initialize the local fallback there because filesystem writes would not be durable. Database migrations should be run by an operator before deployment rather than by concurrent function invocations. Set `APP_URL` to the deployed HTTPS origin; preview origins need their own matching value.

Use Node 24 and the standard Next.js preset. Build requires no paid provider credentials. Runtime AI/OCR features need their respective keys. Source migrations are included in the server build trace, while local data directories are excluded.

### The live deployment

The pilot runs at https://wasl-sable.vercel.app (Vercel project `wasl`, region `bom1`) with the Supabase project "Wasl MVP" (`ap-south-1`). Pushes to `main` deploy automatically. After resetting the database password, run `node scripts/connect-database.mjs` (it asks for the password without echoing it and stores the connection as a Vercel secret), then `npx vercel deploy --prod`. AI recall is turned on the same way: `node scripts/connect-openai.mjs` asks for an OpenAI API key without echoing it, checks it with a free request and stores it as the `OPENAI_API_KEY` secret.

## Privacy and account handling

Private notes never enter a public card. Public routes project only selected profile fields and use `no-store` caching. QR URLs use unguessable share tokens. An active link reflects current selected fields. A saved contact is a private snapshot: **Update shared details** refreshes the snapshot from a still-active link without touching private notes. Revocation prevents future link reads but cannot erase previously saved copies.

Passwords use salted scrypt hashes. Session tokens are hashed in the database, expire after 14 days, and are revoked at logout. Mutations require the app origin, and body sizes and request frequency are bounded. Production uses secure HttpOnly cookies and requires HTTPS.

Set `TRUST_PROXY=true` only if the hosting proxy overwrites `X-Forwarded-For`. Otherwise authentication rate limiting uses a conservative shared bucket rather than trusting a spoofable header. Sign-up and sign-in allow 150 attempts per network address per 15 minutes (a whole event can share one Wi-Fi), and 10 sign-in attempts per account per 15 minutes against password guessing. Avoid logging contact payloads, provider response bodies, or credentials.

Use Settings to export a user's profile, cards, contacts, and interaction history, to change the password (which signs out other devices), or to delete the account: after the password is confirmed, the profile, cards, links, connections, notes and search data are removed. Copies of their card that other people already saved stay with those people. Contact deletion cascades to its notes and embeddings. Card deletion revokes its links while preserving copies already saved by someone else. For local backups, stop the application before copying the complete data directory. Protect the backup as private contact data. Hosted deployments should use the database provider's backup and restore facilities.

Before an unrestricted public launch, add verified email ownership, self-service password recovery by email (needs an email service such as Resend and its key), abuse monitoring, and a retention/privacy policy. These are not represented as implemented controls.

## Verification and CI

`npm test` uses real PostgreSQL semantics through isolated PGlite databases, including RLS and disk persistence. `tests/api.test.ts` calls the actual HTTP handlers with two accounts. Run `npm run build` before `npm run test:e2e`: browser tests start the production build on port 3100, with isolated disk storage and disabled provider keys; they never reuse a normal local server.

GitHub Actions provisions `pgvector/pgvector:pg17` and also checks the ordinary PostgreSQL driver:

```sh
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wasl_ci npm run test:postgres
```

This test deliberately accepts only a local host and database name ending in `_ci`. It creates synthetic records and deletes only the fixture users. Never point it at a production database.

The CI pipeline runs type checking, application/security tests, the PostgreSQL adapter test, a production build, and desktop/mobile browser scenarios. Browser traces are retained when a scenario fails. Live OpenAI/Google entitlement and live Supabase/Vercel deployment still require separate verification after credentials and projects are configured.

## Scope

The product implements the whole mockup flow: capture (card and QR scanning), share (cards, QR, two-way swap, invites), store (where you met, tags, consent-based chat key points, albums, today's people) and recall (typed or spoken, with AI). LinkedIn import, scraping, calendar reading, event guest lists, NFC, push notifications, payments and Apple Wallet are outside this release; `docs/DEVELOPMENT_PLAN.md` explains why and what Wasl does instead.
