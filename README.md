# Hinsdale Central FFA

A browser first-person free-for-all shooter on the real Hinsdale Central High School campus (outdoors only).
Built from OpenStreetMap data and satellite imagery, with an optional Google Photorealistic 3D Tiles mode.

**Play:** https://wellsdouraghy.github.io/hinsdale-central-ffa/

## Playing with friends
1. One person opens the link, enters a name and clicks **Host Game**. They get a 6-character room code.
2. Everyone else clicks **Join Game** and types the code, or opens the host's invite link (**Copy invite link**).
3. Up to 8 players. The host picks Free-for-all or Capture the Flag and can restart from the end screen.

Matches are peer-to-peer (PeerJS): no game server. Keep the host's tab open; if the host leaves, the match ends.
Some strict school/office/mobile networks block peer-to-peer connections.

**Controls:** WASD move · Ctrl (Mac default) or Shift hold to sprint (Settings → Sprint key) · Space jump · C crouch (slide while sprinting) ·
F grapple (F again to let go, Space to fling) · E boost dash · Space in mid-air boost jump · jump into ledges to climb ·
Left click fire · Right click hold to aim · Ctrl+click or Q toggle aim · R reload · 1/2 or wheel switch · V melee · Tab scoreboard · Esc menu.
**Modes:** Free-for-all (30 kills / 10 min) or Capture the Flag, Red Devils vs Lions (3 captures / 12 min), chosen by the host. Practice has both.
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
