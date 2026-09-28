# Technical plan

## First version

Wasl should begin as a responsive web application. The first version includes accounts, professional and personal cards, selected-field sharing, card links and QR codes, saved contacts, categories, private notes, events, meeting dates, and interaction history.

The system should store profiles, cards, connections, and interactions with explicit ownership. Shared links expose only the fields selected by the card owner. Private records must be protected through server-side authorization and database row-level security.

## Build order

### 1. Core flow

- Set up authentication and the database schema.
- Create and edit a card.
- Share selected fields through a link or QR code.
- Save a shared card as a connection.
- Add a private note, event, and meeting date.
- Demonstrate the flow using two accounts on two phones.

### 2. Reliable search

- Add categories, editing, and duplicate handling.
- Search by name, occupation, category, event, and notes.
- Verify that one user cannot read or change another user's private records.
- Verify that saved data remains after refresh.

### 3. Natural-language search

- Generate embeddings for the signed-in user's saved contact context.
- Retrieve relevant records before generating any summary.
- Show the saved notes that support each result.
- Handle ambiguous and no-match queries without inventing details.
- Keep keyword search available if the AI service is unavailable.

An example acceptance query is: "Who was the cybersecurity person I met at the entrepreneurship event?"

## Deferred scope

Conversation recording, nearby-contact discovery, NFC, and phone-wallet integration should wait until the core workflow is reliable.

