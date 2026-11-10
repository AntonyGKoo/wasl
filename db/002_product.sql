-- Product features from the mockup: Team cards, albums you make yourself, two-way card swaps.
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_kind_check;
ALTER TABLE cards ADD CONSTRAINT cards_kind_check CHECK (kind IN ('professional','social','event','team'));
-- names of the albums a person belongs to (albums by event and company are worked out, not stored)
ALTER TABLE connections ADD COLUMN IF NOT EXISTS albums text[] NOT NULL DEFAULT '{}';
-- how the person got into the network: '' typed, 'scan' paper card, 'link' saved from their card, 'swap' they sent theirs back
ALTER TABLE connections ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT '';
-- a card someone swapped back to you stays marked New until you open it
ALTER TABLE connections ADD COLUMN IF NOT EXISTS unseen boolean NOT NULL DEFAULT false;
