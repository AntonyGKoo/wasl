# Wasl team demo — 25 October 2026

Team guide and recorded backup: **https://wasl-team-prototype-oct26.helloworldd.chatgpt.site**

Current interactive demo: **https://biography-llc-handling-precision.trycloudflare.com**

Open the interactive demo and click **Open presentation demo**. It uses the actual Wasl backend with a separate fictional database, on port 3001. The normal local presentation on port 3000 keeps its own clean data.

Everyone using the demo login shares the same fictional account, so practice changes are visible to the team. Use fictional information only. Mariam and the CTO note may already exist after someone rehearses; saving the same card does not create a second contact.

The live link is temporary. Antony's Mac must stay open, plugged in and online, with the shared demo running. The launcher prevents idle system sleep while running on macOS; closing the lid or losing connectivity can still interrupt it. The static guide and recorded backup stay available independently.

## Restart sharing

Double-click **Start Shared Wasl Demo.command**, or run `npm run demo:share`. Stop the existing shared demo first with Ctrl+C. Restarting resets only the shared fictional accounts and generates a **different** HTTPS URL; copy the new URL from the terminal or `.wasl-demo/share-url.txt`, then tell the team. Update the live link in the hosted guide if sharing again later.

The launcher uses the installed production build. For a fresh clone, run `npm ci` and `npm run build` first. Rebuild after application source changes, before starting presentation servers. Install `cloudflared` from [Cloudflare's official downloads](https://developers.cloudflare.com/tunnel/downloads/) if it is not installed. On this Mac it is already cached in the ignored `.wasl-demo/bin/` directory.

Cloudflare Quick Tunnels require no account and are intended for temporary testing. They have no uptime guarantee, and the URL changes on restart. Keep the local demo and offline backup ready for class. Hosted PostgreSQL and permanent application hosting remain pending; this temporary link is not a permanent cloud deployment.

## Message to copy into the team group

Hi team, the Wasl prototype is ready for tomorrow.

Live demo: https://biography-llc-handling-precision.trycloudflare.com

Click **Open presentation demo**. We share fictional practice data, so please don't enter personal information. This link works while my laptop is online.

Script and backup: https://wasl-team-prototype-oct26.helloworldd.chatgpt.site

Our four-minute flow is: profile → choose sharing fields → share a card → save Mariam → add a private note → search “CTO.” Today's search uses keywords; live AI and photo scanning are still pending.

Let's divide the speaking parts and do one quick rehearsal before class. One person can introduce the problem and sharing, one can show saving and notes, and one can show recall and next steps. I'll control the demo on my laptop.
