# Wasl

Wasl is a mobile-first networking application for sharing selected contact details and remembering the context behind professional connections.

## Product goal

The first release will support one complete flow:

1. Create a professional or personal card.
2. Choose which fields to share.
3. Share the card using a link or QR code.
4. Save another person's card as a connection.
5. Add private notes, an event, and a meeting date.
6. Find the connection later through keyword search and, after the core flow is reliable, natural-language search.

## Proposed stack

- Next.js, React, and TypeScript
- Supabase Auth and PostgreSQL
- PostgreSQL row-level security
- pgvector for semantic retrieval
- Playwright for end-to-end testing

The stack is a proposal for team review. No application implementation has been committed yet.

## Delivery milestones

1. **Core flow:** two users can create, share, save, and annotate a card.
2. **Reliable search:** editing, categories, keyword search, and authorization checks work correctly.
3. **AI search:** natural-language retrieval returns grounded results from the signed-in user's saved data.

See [the technical plan](docs/TECHNICAL_PLAN.md) for scope and completion checks.

## Getting started

Development instructions will be added when the application scaffold and environment requirements are agreed by the team.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

