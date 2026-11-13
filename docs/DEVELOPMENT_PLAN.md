# Wasl: from demo to real product

The clickable mockup shows the product we promise. This plan lists every feature in the mockup, what the real app (https://wasl-sable.vercel.app) had on Nov 10, and what we built so each one works with real accounts and real data.

## Feature by feature

| Demo step         | What the demo shows                                                           | Real app before                                                  | Built now                                                                                                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Join            | Scan your own card and your profile fills itself. Wasl makes your first card. | Email sign-up, profile typed by hand, no card until you make one | The first page offers **Scan my business card** before signing up, and Profile has **Fill my profile from my card** (photo or pasted text, read on the phone, AI when connected). A first **Professional card** is made at sign-up. |
| 1 Profile         | Photo, profile level, missing details to add                                  | Text fields only                                                 | **Profile photo** (made small and square on the phone), shown on cards, saved contacts and vCards. **Profile strength** meter that lists what's missing.                                                                            |
| 2 Build           | Cards for different crowds, switches for each detail, live "What they'll see" | Cards with checkboxes, 3 kinds                                   | **Live preview** while editing, **Team** card kind, photo as a detail you can share or hide.                                                                                                                                        |
| 3 Share, has Wasl | Both phones swap cards in one scan                                            | One way only: they could save your card, you got nothing back    | **Two-way swap**: when a signed-in person saves your card they can send one of theirs back in the same tap, and it shows up in your network marked **New**. **Scan their code** inside the app (camera QR reader).                  |
| 3 Share, no Wasl  | Scan their paper card, Wasl invites them                                      | Card scan existed, no invite                                     | **Invite to Wasl** by email, text or the phone's share sheet, with your card link. QR codes on paper cards (vCard) are read too.                                                                                                    |
| 4 Save            | Where you met is filled in; one-tap tags                                      | Event and place typed by hand, tags typed with commas            | **Where you met** carries over from the last person you saved today. **Use my location** fills the place. **One-tap tags** (Hiring, Intro offered, Follow up…).                                                                     |
| 5 Remember        | Record the chat with consent, keep only key points                            | Built (Nov 9)                                                    | Key points marked when written by AI.                                                                                                                                                                                               |
| + Debrief         | Swipe through tonight's people                                                | Missing                                                          | **Tonight's people**: everyone you met today (or at your latest event); swipe right to favorite, left to keep, mic to add a memory.                                                                                                 |
| 6 Browse          | Albums by event and company build themselves; make your own                   | One list with tag filters                                        | **Albums** built from events and companies, **your own albums**, and **group by** Recent, Event, Company or Tag.                                                                                                                    |
| 7 Search          | Find people by memory, by typing or speaking                                  | Built, AI on Nov 9                                               | **Ask by voice** in Recall.                                                                                                                                                                                                         |
| Settings          | Consent before recording, no audio kept, location use                         | Export and sign out                                              | **Change password**, **delete my account** (removes everything), location switch.                                                                                                                                                   |

## What a web app cannot do, and what we do instead

- **Read the phone's calendar.** Browsers don't allow it. Wasl reuses the event you entered for the last person you saved today, so a whole evening needs typing once.
- **A full import from LinkedIn.** LinkedIn only shares name, email and photo, and only through an approved LinkedIn developer app. "Import from LinkedIn" on the first page therefore takes your profile link: Wasl puts the link on your card and makes a first guess at your name from it. Scanning your card fills more.
- **Event guest lists ("who's going").** Needs event partners. Later.
- **Password reset by email.** Needs an email service (for example Resend) and its key. Until then, signed-in people can change their password in Settings.
- **NFC tap and push notifications.** Need a native app. QR works on every phone today.

## Order of work

1. Database change `db/002_product.sql` (Team cards, albums, swap origin and the "New" marker), applied locally and on Supabase.
2. Server: swap, albums, favorite, location lookup, password and account deletion, first card at sign-up.
3. App screens: swap on the shared-card page, QR scanner, profile fill and photo, card preview, where-you-met, tags, albums, Tonight's people, voice search, invite, settings.
4. Tests: unit tests for the server, and a phone and laptop review that signs up two people on a local copy and swaps cards between them.
5. Release: push to GitHub, Vercel deploys, check the live site.

## Final check before hand-off (Nov 12)

Every flow was walked through as a new person on a phone and a laptop, including things going wrong (no camera, microphone or location permission, a lost session, odd inputs), and the server code was read end to end. What that found and fixed:

- **Search with nobody saved** looked broken. It now says there is no one to search yet, offers sample people, and builds its example questions from your own events, tags and companies.
- **The phone's Back button** left Wasl. It now closes the dialog on top, then goes to the screen before.
- **A session ending while the app was open** left every tap failing. The app now returns to sign-in with the reason, and back to the same screen after.
- **Links typed the way people say them** ("linkedin.com/in/me", "@handle", "mysite.dev") were rejected. They are completed for you, in the forms and on the server.
- **The QR code LinkedIn or Instagram shows for a profile** was refused as "not a contact". It now starts a new person with the link filled in and a first guess at the name.
- **AI**: a card read by AI was thrown away whole if one link or email was badly formed; searches, card reading and summaries returned an error once the day's allowance was spent. Each now keeps what is valid and falls back to the built-in rules or keyword search with a line that says why.
- **Accounts**: signing up with an email already in use gives a clear message and a way to sign in; the sign-in screen explains what to do about a forgotten password; sessions last 30 days from the last visit; the request size limit now fits a profile photo and Arabic text.
- **Smaller things**: deleting a memory asks first; a new card never gets the same name as one you have; a card link you saved before says so; a regex form that stops the app loading on iPhones before iOS 16.4 is gone.
- **Design**: the sign-in form is on the first screen of a phone; a person's name is no longer squeezed onto two lines; Today's people no longer shows text from the card behind; Arabic names line up with the rest of a list; the last all-capitals headings are plain sentence case.

Known limits, stated plainly: password reset by email needs an email service; card photos are read in English only; on the live site AI search has been seen working with the real provider, while AI card reading and chat summaries have only been tested against a stand-in.

## The same first page as the mockup (Nov 12)

A teammate pointed out that the mockup opens on a welcome page (scan your card, import from LinkedIn, or sign up with email) while the app opened straight on the email form, and that the mockup had no way to sign in.

- **App**: the first page now offers **Scan my business card**, **Import from LinkedIn**, **Sign up with email instead** and **Sign in**. A card scanned before signing up is read on the phone (nobody is signed in yet, so nothing is sent anywhere); its details are shown back, fill the sign-up form, and go on the new profile, which opens first so the person can check it. Once the account exists, Wasl's AI sorts the same words more carefully when it is connected. The phone's Back button returns from the form to the first page. Someone arriving to save a shared card, or signed out mid-way, still goes straight to the form.
- **Mockup**: the first page has **Already have an account? Sign in**, which opens a "Welcome back" sheet and lands on the network.
- The Cards page is titled **My cards** in both.
- **After signing up from a card**, the profile says "Your profile is ready" with **See my card**, the same next step as the mockup.
- **Place from your location**: OpenStreetMap's free lookup sometimes turns a call away when it is busy, which left the place empty with "type it instead". Wasl now tries once more, and keeps each spot's answer for half an hour, so saving several people at one event asks only once.

## One more pass (Nov 14)

Everything was walked through again on a phone and a laptop, in both looks, and the code was read once more. What changed:

- **A swap shows on both phones.** The person showing their code used to see nothing until they reloaded. Their phone now asks every few seconds while the code is on screen, says "You swapped cards with …" as it happens, and opens the new person in one tap. Wasl also looks for new people whenever you come back to it or open Network, and the screen stays awake while your code is showing.
- **No Wasl on the other side.** The Share dialog now offers **Scan their card**, the mockup's "No Wasl" path, next to **Scan their code**.
- **Wording.** The Cards page said notes "never leave your phone". They are kept in your account so they follow you to a laptop, so it now says notes are never on a card. The Search tab uses a magnifier, like the mockup. The line under AI search says in plain words what is sent to OpenAI.
