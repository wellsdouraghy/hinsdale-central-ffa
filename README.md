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
G frag grenade (hold to cook) · 4 use killstreak (3 kills: care package, 5: UAV, 7: airstrike) · hold X capture a care package · F grapple (F again to let go, Space to fling) · E boost dash · Space in mid-air boost jump · jump into ledges to climb ·
Left click fire · Right click hold to aim · Ctrl+click or Q toggle aim · R reload · 1/2 or wheel switch · V melee · Tab scoreboard · Esc menu.
**Classes:** Rifleman, Runner, Brawler, Recon, Grappler (keys 1-5 on the deploy/death screen). **Proximity voice chat is always on in online lobbies** (microphone required; not in Practice).
**Modes:** Free-for-all (30 kills / 10 min, with one attack helicopter hidden somewhere on campus), Team Deathmatch (Red Devils vs Lions, 50 kills / 10 min) or Capture the Flag (3 captures / 12 min), chosen by the host along with 0-7 AI bots (Easy/Normal/Hard). Practice has all three.
**Helicopter (FFA):** hold X near it to fly · mouse steers/aims · W/S/A/D move · Space climb · C descend · Shift boost · LMB chin cannon (overheats) · R or RMB rockets · X to exit near the ground · no fuel limit: it stays until destroyed (crashes, rams and rotor strikes count).
**Melee (V) is always a one-hit kill.**
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
