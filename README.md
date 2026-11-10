# Wasl · وصل

**Never forget who you met, or why it mattered.** You meet 50 people at an event and remember 5. Wasl keeps the story of every meeting and finds people later by what you remember, not by their name. Swapping cards takes one scan.

- **Live app:** https://wasl-sable.vercel.app. Works in any phone or laptop browser and installs like an app from its sign-in screen (iPhone: Share → Add to Home Screen).
- **Clickable mockup:** https://antonygkoo.github.io/wasl-prototype/ (sample people, timed user-test mode; source in `public/mockup/index.html`).

## What it does

| Step | What you do | What's behind it |
|---|---|---|
| **1 · Capture** | Fill your profile by scanning your own business card. Save someone by scanning their Wasl code, their paper card, or the QR code printed on it. | Card photos are read on the phone (Tesseract.js) and **Wasl's AI** sorts the words into fields; you check every field before saving. QR codes (Wasl links, vCards) are read on the phone (jsQR). |
| **2 · Share** | Keep cards for different crowds (Professional, Event, Social, Team) and switch each detail on or off with a live preview. Show your QR code; the other person saves your card and **sends theirs back in the same tap**. Invite people without Wasl by email, text or the share sheet. | Each card has a revocable link that only exposes the details it shows. A swap creates the connection in both networks; yours is marked **New**. |
| **3 · Store** | Save where you met (carried over from the last person you saved that day, or filled in from your location) and tag people in one tap. With both people's consent, record the chat and keep only the key points. Swipe through **today's people** after an event. | The browser writes the chat down as text, no audio is kept, and **Wasl's AI** picks the key points for you to edit. Albums build themselves from events and companies, and you can make your own. |
| **4 · Recall** | Ask by typing or speaking, like "the person who offered an intro to a CTO". | Keyword and vector search (pgvector) make a shortlist. **Wasl's AI** returns only people from that list, each with the exact saved line that matches, and never invents anyone. |

Without an AI key, every step still works with built-in rules, and nothing pretends to be AI.

**Your data stays yours:** notes, tags and albums are private; cards share only what you choose; export everything, change your password or delete your account in Settings.

## Tech stack

Next.js 16 · React 19 · TypeScript · PostgreSQL + pgvector (Supabase in production, PGlite locally) with row-level security · OpenAI `gpt-4o-mini` and `text-embedding-3-small` · Tesseract.js · jsQR · Web Speech API · Vercel (Mumbai) · installable web app (PWA).

How each part works: [docs/TECHNICAL_SOLUTION.md](docs/TECHNICAL_SOLUTION.md). From demo to product: [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md).

## Project structure

```
src/app          pages (/ and the shared card page /c/[token]) and the API route
src/components   screens: network, cards, recall, profile, settings, shared card, QR scanner, today's people
src/server       API: accounts, cards and swaps, network and albums, recall, card reading, key points, places
src/lib          shared code: database, auth, validation, card text, QR codes, photos
db/              SQL migrations, applied in order (001 schema and security, 002 product features, 003 locks the migration log)
public/          app icons and logo; the clickable mockup (public/mockup)
scripts/         dev server, OCR files, migrations, connecting the database and OpenAI, mockup screenshots
tests/           server and HTTP tests (*.test.ts), browser tests (e2e/), sample card photos (fixtures/)
docs/            technical solution, development plan, operations; mockup screenshots; archive of past check-ins
```

## Run it locally

Use Node.js 24 (22 or newer works).

```sh
npm ci
npm run dev
```

Open the printed address and create an account. A real PostgreSQL database (PGlite) is created in `.wasl-data/`, so accounts and contacts survive restarts. No Docker or cloud keys are needed. To try AI features, copy `.env.example` to `.env.local` and set `OPENAI_API_KEY`.

To test with two phones on the same Wi-Fi, open the server's **Network** address on both; a QR code made on `localhost` doesn't open on another device.

## Deploy

The live app runs on Vercel with a Supabase database; every push to `main` deploys. Database migrations are run once per change with `npm run db:migrate` against the hosted database. Keys are added without showing them: `node scripts/connect-database.mjs` and `node scripts/connect-openai.mjs`. Details, environment variables and security notes: [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Checks

```sh
npm run format:check
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The tests cover account isolation, two-way swaps, albums, password change and account deletion, sign-in limits, recall evidence, card and QR parsing, and the full share → save → memory → recall flow in desktop and phone browsers. GitHub Actions runs all of them on every push, plus a check against a real PostgreSQL + pgvector database.

`npm run demo` still starts the offline presentation workspace from the 26 October check-in; material from earlier check-ins is in [docs/archive](docs/archive/README.md). See [CONTRIBUTING.md](CONTRIBUTING.md) for the review workflow.
