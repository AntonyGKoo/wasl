# Wasl prototype check-in — Monday 26 October 2026

Aim for **four minutes total for the team**. The provided message asks for a 3–5 minute prototype walkthrough showing the interface and the user flow from start to finish. It does not ask for a PPT. Use the live app; keep the screenshot walkthrough as a backup.

## Open the demo

Double-click **Start Wasl Demo.command** in the project folder. Keep that Terminal window open. Open **http://localhost:3000** and click **Open presentation demo**.

Terminal alternative, from the project folder:

```sh
npm run demo
```

The launcher uses Node 22 or newer (Node 24 recommended), resets a separate fictional workspace, builds the app, and starts it locally. It does not need Supabase, OpenAI, Google Vision, or Wi-Fi. Dependencies must already be installed; on a teammate's new machine run `npm ci` while online first.

It leaves normal `.wasl-data/` and `.env.local` untouched. Restarting the command resets the presentation accounts and their demo data. Stop the running demo with **Ctrl+C** before starting it again. If port 3000 is already in use, use the existing app or stop its Terminal first.

Manual demo login, if needed: `demo@wasl.example.test` / `WaslDemo2026!`. These are public fictional credentials for this local demo only. New normal accounts do not receive sample data.

## Before class — five minutes

1. Connect the laptop charger and test the projector/display.
2. Start the demo. Enter it, then open **Your profile**. Start the presentation on that screen; do not spend class time on installation or login.
3. Keep this guide open separately. Copy the note below before the demo, or type it live.
4. Rehearse the exact flow once. Then press Ctrl+C in the demo's Terminal and start it again for a clean run. Open the demo and return to **Your profile**.
5. Open `docs/presentation/index.html` as the offline screenshot backup. If the app fails during class, switch to **Backup walkthrough** immediately and continue talking.

Do not ask the audience to scan a localhost QR code. Show it, then use **Open Mariam's card** on the same laptop to demonstrate the receiving flow. A second phone needs a hosted or reachable network address; it is unnecessary for this check-in.

## Four-minute script and exact clicks

### 0:00–0:25 — the problem

Start on **Your profile**. Say:

“Hi everyone. This is Wasl, a networking wallet for students and people who go to events. After meeting someone, we often remember the conversation but forget their name. Wasl helps us keep the person and the context together. I’ll show the full flow using fictional profiles.”

### 0:25–1:10 — my profile and sharing choices

Point to the profile. Click **Your cards → Edit Event**. Show that the email checkbox is off. Click **Cancel**, then the **Event** card's **Share card** button. Say:

“I enter my details once in my profile. Then I can make different cards for different situations. For example, my professional card includes my email, but my event card only shares my name, role and university. I choose the details that leave my wallet. The card can be shared through a QR code or a link.”

Close the sharing dialog. Do not demonstrate changing passwords, revoking links, or every setting.

### 1:10–2:00 — capture a connection

Click **Open Mariam's card** in the top bar. In **Where did you meet?**, type `Campus networking night`. In **Place**, type `Doha`. Click **Save to my Wasl network → Open your network → Mariam Ali**. Say:

“Now imagine I meet Mariam at a campus networking event. This is the card she chose to share with me. I save her to my Wasl network and add where we met. Her contact details and the event are now in one place, so I don’t have to remember everything later.”

### 2:00–2:40 — remember the conversation

In **Add an interaction or something to remember**, enter:

```text
Offered to introduce me to her CTO.
```

Click **Save memory** and point to the saved note. Say:

“The important part is what happened in the conversation. Mariam offered to introduce me to her CTO, so I save that as a private note. I can add more interactions as the relationship develops. These notes stay in my own network and are never included in the card I share.”

### 2:40–3:25 — recall the person

Close the dialog. Click **Recall**. Type `CTO` in **Search your memory**, then click **Find connections**. Point to **Mariam Ali** and the quoted note. Say:

“A few weeks later, I might forget Mariam’s name, but remember that someone mentioned their CTO. I search for ‘CTO’, and Wasl finds Mariam using the note I saved. It also shows the context, so I can check why this person appeared. This connects sharing, saving, remembering and finding someone again.”

### 3:25–4:00 — what is implemented and what comes next

Stay on the result. Say:

“This prototype already saves profiles, cards, connections and private notes, and supports searching those saved details. The search shown today uses keywords. Our next steps are to test the flow with students and connect AI recall and photo scanning. The main thing we want to learn is whether people can save enough useful context quickly after a conversation.”

Stop here. Leave room for questions. If several teammates speak, one can introduce the problem and cards, one can save Mariam and the note, and one can show recall and close. Use one person to control the laptop.

## Short answers if asked

- **Do you need AI for this demo?** “No. Today’s search uses saved words and notes. AI recall and photo scanning have integration code, but live service setup is still pending.”
- **How is this different from a normal contacts app?** “We keep the event and the conversation alongside the contact, then use that context to find the person later.”
- **Is the data private?** “A shared card only exposes selected fields. Notes belong to the person who saved them. The demo uses fictional data in a separate local workspace.”
- **Is it connected to LinkedIn?** “We currently support manually entered profile links. We are not importing or scraping other people’s profiles.”
- **Is it deployed?** “The app is running locally for this check-in. A Supabase project exists, but its live database connection and public hosting still need setup.”
- **What feedback do you want?** “Was the flow clear? Which information would you actually save after meeting someone? Is adding a note quick enough?”

## If you are running out of time

Skip opening **Edit Event** and just point to the selected-field chips on the cards. Keep the save → note → recall flow. If searching produces no result, first check that you clicked **Save memory**, then search the exact word `CTO`. If the app stops responding, use the backup screens instead of debugging in front of the class.
