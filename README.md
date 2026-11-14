# Hinsdale Central FFA

A browser first-person free-for-all shooter on the real Hinsdale Central High School campus (outdoors only).
Built from OpenStreetMap data and satellite imagery, with an optional Google Photorealistic 3D Tiles mode.

**Play:** https://wellsdouraghy.github.io/hinsdale-central-ffa/

## Playing with friends
1. One person opens the link, enters a name and clicks **Host Game**. A lobby opens with a 6-character room code.
2. Everyone else clicks **Join Game** and types the code, or opens the host's invite link (**Copy invite link**), and lands in the lobby (open voice chat there).
3. Up to 8 players (bots fill the empty slots). In the lobby the host picks the mode (Free-for-all, Team Deathmatch, Capture the Flag), bot count/difficulty and score limit, and moves players between Red Devils and Lions (drag or arrows). Joiners can switch teams if it stays balanced and mark **Ready**.
4. The host clicks **Start match** (3-second countdown). After the match the host can take everyone **Back to lobby** with the same code. Friends who join mid-match drop straight in.

Matches are peer-to-peer (PeerJS): no game server. Phones and tablets get a "continue on desktop" screen. Keep the host's tab open; if the host leaves, the match ends.
Some strict school/office/mobile networks block peer-to-peer connections.

**Controls:** WASD move · Shift hold to sprint (or Ctrl, in Settings → Sprint key) · Space jump · C crouch (slide while sprinting) ·
G frag grenade (hold to cook) · 4 use killstreak (3 kills: care package, 5: UAV, 7: airstrike) · Airstrike: 4 opens the targeting laptop (mouse moves the reticle on the campus map, wheel or A/D rotates the run, LMB confirms, RMB/Esc/4 cancels and keeps it) · hold X capture a care package · F grapple (F again to let go, Space to fling) · E boost dash · Space in mid-air boost jump · jump into ledges to climb ·
Left click fire · Right click hold to aim · Ctrl+click or Q toggle aim · R reload · 1/2 or wheel switch · V melee · Tab scoreboard · Esc menu.
**Classes:** Rifleman, Runner, Brawler, Recon, Grappler (keys 1-5 on the deploy/death screen). **Voice chat is always on in online lobbies** (microphone required; not in Practice): in TDM/CTF your team always hears you; enemies only by proximity. Settings has Master / Effects / Voice volume.
**Modes:** Free-for-all (30 kills / 10 min) and Team Deathmatch (Red Devils vs Lions, 50 kills / 10 min), each with one attack helicopter hidden somewhere on campus, or Capture the Flag (3 captures / 12 min), chosen by the host along with AI bots (up to 12 players in total; in team modes the host sets bots per team, e.g. 10 v 2) (Easy/Normal/Hard). Practice has all three.
**Helicopter (FFA + TDM):** first to find it takes it (bots too, if they stumble on it) · hold X near it to fly · mouse steers/aims · W/S/A/D move · Space climb · C descend · Shift boost · LMB chin cannon (overheats) · R or RMB rockets · X to exit (near the ground it stays parked; higher up you bail out and it crashes, crushing anyone below) · no fuel limit: it stays until destroyed (crashes, rams and rotor strikes count; in TDM it never hurts teammates and teammates can't damage it).
**Melee (V) is always a one-hit kill** and plays a short third-person finisher scene (you can still be shot while it plays). **Minimap:** teammates are green arrows (facing), enemies red dots when revealed (gunfire, UAV, flag carrier); the helicopter is green when your side flies it, red otherwise.
**Settings:** sensitivity, FOV, graphics quality (use Low on weaker laptops), map style (Built campus / Real 3D scan).

## Development
```bash
npm install
npm run dev      # http://localhost:5173
npm run deploy   # build and publish to GitHub Pages
```
The Google Map Tiles key is read from `.env.local` (`VITE_GOOGLE_TILES_KEY=...`, not committed) at build time.
Module layout and interfaces: `CONTRACTS.md`. Asset credits and licenses: `CREDITS.md`.

Fan-made; not affiliated with Hinsdale Central High School or District 86.
