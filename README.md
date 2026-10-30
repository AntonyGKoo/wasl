# Wasl

The memory for your network. A mobile-friendly networking wallet with selective card sharing, saved connections, private interaction history, and contact recall.

## Run the MVP

For the **26 October prototype check-in**, use `npm run demo` or double-click **Start Wasl Demo.command**. This starts an isolated local workspace with fictional contacts, one-click demo login, and a repeatable share → save → private note → recall flow. See [the four-minute script and setup](docs/PRESENTATION.md) and [offline backup walkthrough](docs/presentation/index.html).

For teammates on other devices, see [the shared demo and team message](docs/TEAM_DEMO.md). `npm run demo:share` opens a temporary HTTPS link using a separate fictional workspace; the laptop must stay online. The local presentation remains independent.

For the **2 November prototype check-in**, open the [clickable mockup](public/mockup/index.html) (served at `/mockup/index.html`). It covers all seven steps of the gamified flow with sample data and has a timed user-test mode. [The technical solution](docs/TECHNICAL_SOLUTION.md) explains how each step works and what is built versus mocked. Slide screenshots are in `docs/presentation/mockup-screens/`.

For a phone-format presentation, see [the mobile presentation kit](docs/MOBILE_PRESENTATION.md): an 80-second portrait walkthrough, 12 phone screenshots, and optional narration.

Use Node.js **24 LTS** (22 or newer is required).

```sh
npm ci
npm run dev
```

Open the printed local URL and create an account. There is no default login or pre-populated network. The first request initializes **persistent server-side PostgreSQL** through PGlite in `.wasl-data/`; accounts and contacts survive refresh and restart. No Docker or cloud credentials are needed for the core flow.

For two-phone QR testing, open the server's printed **Network URL** on both phones over the same network. A QR generated from `localhost` will not point to your computer from another device. If `APP_URL` is configured, it must match the address being used.

## What works

- Real registration, password login, revocable sessions, and central profile editing.
- Multiple cards, selected-field sharing, QR codes, public links, and revocation.
- Recipient signup/login followed by saving a card inside Wasl.
- Saved contacts, categories, favorites, meeting context, private notes, and interaction history.
- Editing/deletion, source-card refresh, vCard downloads, and JSON export.
- Evidence-backed keyword recall; pgvector/OpenAI recall when credentials are configured.
- Reviewed Google Cloud Vision card scanning when configured; local paste-text capture without providers.
- Responsive desktop/phone layouts, accessible dialogs, server validation, and database row-level security.

Active card links update from the owner's central profile. Saved connections are private snapshots; recipients can refresh them using **Update shared details**. Revoking a link cannot erase information someone has already saved.

## Live integrations and hosting

Copy `.env.example` to the ignored `.env.local` file to configure OpenAI, Google Vision, or a hosted `DATABASE_URL`. Missing keys are shown clearly and never produce simulated AI results.

The app supports hosted PostgreSQL/Supabase and Vercel. Run `npm run db:migrate` against the hosted database before deployment, set an HTTPS `APP_URL`, and use `npm run build`. **Local database files must not be used on an ephemeral/serverless host.**

Authentication is currently application-managed email/password authentication backed by PostgreSQL. Supabase is supported as a database host; this version does not claim to use Supabase Auth or LinkedIn login. See [operations and deployment](docs/OPERATIONS.md) for setup, data handling, integration limits, and pilot boundaries.

## Checks

```sh
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Tests cover account isolation, HTTP flows, sharing projections, private notes, deletion, recall evidence, and disk persistence. GitHub Actions additionally runs real PostgreSQL/pgvector integration tests and desktop/mobile Playwright flows.

```sh
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests exercise the production build with a separate server and database, with paid integrations disabled.

Brand artwork was supplied with the project context. Synthetic contacts exist only in tests or a developer test account, never in a new account. See [CONTRIBUTING.md](CONTRIBUTING.md) for the review workflow and [the original plan](docs/TECHNICAL_PLAN.md) for scope.
