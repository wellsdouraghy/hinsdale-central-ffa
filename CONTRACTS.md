# Hinsdale Central FFA: module contracts

A browser first-person free-for-all shooter set **outdoors** on the real Hinsdale Central High School campus
(5500 S Grant St, Hinsdale IL). Vite + three.js (r187) + ES modules. Deployed as a static site on GitHub Pages
(`vite.config.js` uses `base: './'`). Multiplayer is peer-to-peer with PeerJS room codes (one browser hosts).

Three builders work in parallel on **disjoint files**. Each module below has a placeholder already in place that
implements the interface minimally, so everything runs at all times. Replace your placeholders and keep the
exported interface exactly (you may add extra optional fields/methods). If you need an interface change, add it as an
optional addition and note it at the bottom of this file under "Change log".

## Coordinate frame (shared by everyone)
- Meters. `+x` = east, `+z` = south (so north is `-z`), `+y` = up. Ground is approximately `y = 0` (the campus is flat).
- Origin = center of the satellite image, lat 41.78725, lon -87.93375. See `public/data/campus.json` (fetch as `./data/campus.json`) -> `frame`.
- `public/data/campus.json` (fetch as `./data/campus.json`): OpenStreetMap features already converted to this frame (`buildings`, `roads`, `areas`, `points`;
  polygons are `outer: [[[x,z],...]], inner: [...]`, lines are `line: [[x,z],...]`). Main school building is relation
  `7822857` (single multipolygon, all wings merged, `building:levels=2`). School grounds relation `8286233`.
- `public/assets/satellite/campus_z19.jpg` (URL `./assets/satellite/campus_z19.jpg`, 3542x2751, ~0.22 m/px, Esri World Imagery) covers x in [-394.85, 394.85],
  z in [-305.44, 305.44] exactly; image top = north (z = -305.44), left = west.
- **Play area** (invisible walls): the campus block bounded by the four surrounding streets (streets included, measured
  from the satellite image: north street centerline z~-201, south z~205, west x~-212, east x~191) plus the east
  ball fields/parking lot across the east street: `{ minX: -222, maxX: 292, minZ: -212, maxZ: 214 }`
  (world module owns the exact value via `world.playBounds`). Everything outside is visible scenery (houses, trees).

## World / graphics: `src/world/index.js` (owner: World builder, Fable)
```js
export async function createWorld({ renderer, scene, camera, settings, onProgress }) // -> Promise<World>
// settings: { quality: 'low'|'medium'|'high', googleTilesKey: string|null }
// onProgress(fraction 0..1, label string)
World = {
  collisionMeshes: THREE.Mesh[],   // static, world-space, geometry has .boundsTree (three-mesh-bvh) computed.
                                   // Used for player collision AND bullet raycasts. Includes ground.
                                   // Each mesh.userData.surface = 'concrete'|'brick'|'metal'|'grass'|'dirt'|'wood'|'glass'|'asphalt'|'rubber'
  groundY(x, z): number,           // walkable ground height at x,z (top of terrain, not roofs)
  spawnPoints: THREE.Vector3[],    // >= 24 outdoor spawns at ground level spread over the play area, not inside geometry
  playBounds: { minX, maxX, minZ, maxZ },
  sunDirection: THREE.Vector3,     // normalized, pointing FROM scene TO sun
  update(dt, camera): void,        // every frame (tile streaming, shadow camera follow, etc.)
  render(overlayScene, overlayCamera): void, // renders the frame incl. post-processing, then draws overlayScene
                                   // (first-person viewmodel) on top after clearing depth. overlayScene may be null.
  setSize(w, h): void,
  attributionHTML: string,         // must be shown on screen (OSM, Esri, Google when tiles active)
  dispose(): void,
}
```
The world module owns the renderer configuration (tone mapping, shadows, color space), lights, sky/environment,
post-processing, and Google Photorealistic 3D Tiles mode. In Google mode the custom campus geometry stays as
**invisible** collision; the tiles are visual only.

## Visuals: `src/visuals/` (owner: Visuals builder, Fable)
### `src/visuals/weapons.js`
```js
export const WEAPONS // ids: 'ar', 'smg', 'sniper', 'shotgun', 'pistol' (display data only: name)
export function createViewmodel(weaponId) // -> Viewmodel
Viewmodel = {
  object3D: THREE.Object3D,        // add to overlayScene, positioned in overlay camera space (camera at origin looking -z)
  update(dt, state): void,         // state: { moveSpeed: 0..1, sprinting, ads: 0..1, grounded, lookDelta: {x,y} }
  fire(): void,                    // recoil kick, muzzle flash, shell eject
  reload(durationSec): void,       // reload animation of given length
  equip(): void,                   // raise animation
  muzzleWorldPosition(target: THREE.Vector3, overlayCamera, worldCamera): THREE.Vector3 // muzzle in WORLD space for tracers
  dispose(): void,
}
```
### `src/visuals/character.js` (third-person models of other players)
```js
export function createCharacter({ color: number, name: string }) // -> Character
Character = {
  object3D: THREE.Object3D,        // origin at feet, faces -z when rotation.y = 0, ~1.8 m tall standing
  setState({ speed /*m/s*/, crouching, aimPitch /*rad*/, weaponId, grounded, sprinting }): void,
  fire(): void,                    // third-person muzzle flash
  die(): void,                     // death animation/ragdoll-ish fall; object stays until reset()
  reset(): void,
  update(dt): void,
  dispose(): void,
}
```
### `src/visuals/effects.js`
```js
export function createEffects(scene) // -> Effects
Effects = {
  impact(point: Vector3, normal: Vector3, surface: string): void, // dust/sparks + bullet hole decal
  blood(point: Vector3, dir: Vector3): void,
  tracer(from: Vector3, to: Vector3): void,
  update(dt, camera): void,
}
```
Hitboxes are NOT the visuals' job: gameplay uses simple capsules/spheres around the player position.

## Gameplay, networking, UI: `src/main.js`, `src/game/`, `src/net/`, `src/ui/`, `index.html`, `styles.css` (owner: Gameplay builder, Opus)
- Player controller (capsule collision vs `world.collisionMeshes` using three-mesh-bvh), weapons logic, FFA rules,
  HUD, menus, minimap from the satellite image, audio, PeerJS networking.
- Settings persisted in localStorage: name, sensitivity, FOV, quality, Google tiles key.
- Google key resolution order: `?gkey=` URL param > localStorage > `import.meta.env.VITE_GOOGLE_TILES_KEY` > null.

## Change log
- (Gameplay) No interface changes required. Clarifications of how Gameplay calls the existing interfaces:
  - `Viewmodel.update(dt, state)`: `state.lookDelta` = view change this frame in radians, `x` = yaw to the right, `y` = pitch up.
    `moveSpeed` = horizontal speed / 7.5 (sprint speed), clamped 0..1. The sniper viewmodel is hidden (`object3D.visible = false`)
    while the scope overlay is up (ads > 0.85). Gameplay adds a HemisphereLight + DirectionalLight (from `world.sunDirection`) to the overlay scene.
  - `createEffects(scene)` is called once per World (same scene) and reused across matches.
  - `Character.setState().weaponId` is the remote player's current weapon id; dummies in Practice are plain Characters that never move.
  - Remote hitboxes are gameplay-owned: head sphere r=0.17 at 1.62 m (1.04 crouched), body capsule r=0.29 from 0.33 m to 1.25 m (0.72 crouched).
  - World: Gameplay reads `collisionMeshes` once per frame-change of the array length (it caches per-mesh world AABBs and inverse matrices),
    so meshes must be static after `createWorld` resolves (adding new meshes later is fine; moving existing ones is not).
- (Visuals) All contract interfaces kept; optional additions:
  - `weapons.js`: `preloadViewmodels(): Promise` (hands are async; viewmodels work before it resolves, hands pop in), `ADS_OVERLAY_FOV = 70`.
    Viewmodel extras: `lights` (built-in hemisphere + sun rig; it switches itself off automatically when the overlay scene contains
    any other light, so Gameplay's own overlay lights are fine; the built-in rig is tuned for highlights from the front-top-left, so
    removing the overlay scene's lights or lighting from in front of the camera looks best), `setLighting({ sunDirection, camera, sunIntensity, ambientIntensity, sunColor })`,
    `weaponId`. If `overlayScene.environment` is null the viewmodel installs a small procedural sky PMREM there for reflections
    (recommended instead: `overlayScene.environment = scene.environment`).
    ADS: at `ads = 1` the sight's optical axis is the overlay camera's -z axis (sight centre = screen centre at any FOV); sizes tuned for a
    70 degree vertical-FOV overlay camera with near <= 0.02. `fire()` on the sniper/shotgun also plays the bolt/pump cycle (0.95 s / 0.5 s).
    `muzzleWorldPosition` re-projects from the overlay camera into the world camera so tracers start at the on-screen muzzle.
  - `character.js`: `charactersReady: Promise` (model loads async; characters appear when ready). Crouch lowers the head to ~1.05 m.
    Name tag and accent bands use `color`; `die()` hides the tag, `reset()` restores it.
  - `effects.js`: signature unchanged (decals are instanced quads, no mesh param needed). Extra: `object3D`, `dispose()`.
    `blood(point, dir)`: `dir` = bullet travel direction. Pools: 1536 particles, 192 decals, 32 tracers.
  - Dev page: `/dev/visuals.html` (`?view=vm|chars|fx|gun&w=<id>&ads=1&fire=1&reload=2&pause=<s>&warm=<s>`).
- (World) Contract interface kept exactly; optional additions on the object returned by `createWorld`:
  - `surfaceAt(x, z)` -> `'grass'|'asphalt'|'concrete'|'rubber'|'dirt'` (1 m lookup of the ground surface mask). The ground collision is
    also split into one mesh per surface (`userData.isGround = true`, `userData.surface` as above), so plain raycasts already get the right surface.
  - Collision meshes with `userData.bulletPassthrough === true` are chain-link fences / nets (surface `'metal'`): solid for players;
    Gameplay may let bullets pass through them (optional, default behaviour is that they stop bullets like everything else).
    Car windows / bus glass are their own `'glass'` mesh. Bleacher seating is a walkable ramp in collision (30 deg).
  - `quality`, `environment` (the HDRI equirect texture; `overlayScene.environment = world.environment` gives the viewmodel matching
    reflections), `sun` (the DirectionalLight, lives in the main scene), `googleTilesActive` (boolean), `tiles` (debug handle).
  - `attributionHTML` is a getter and changes over time in Google mode (Google logo + per-tile data attributions): re-read it ~1x/second.
  - `update(dt, camera)` must be called every frame (tile streaming, shadow frustum follow, tree LOD, wind). `render()` draws the
    overlay scene inside the post-processing chain (tone mapping, bloom and SMAA apply to the viewmodel too); on `low` it is drawn
    directly with ACES tone mapping. The world owns `renderer.setPixelRatio` (capped per preset: low 1.0, medium 1.25, high 1.5),
    `toneMapping`, `shadowMap`, `scene.background/environment/fog`.
  - Spawn points are generated by a walkability flood fill over the collision meshes (32 points, farthest-point spread, biased to cover).
  - Asset URLs are relative to the page (`./assets/world/...`, `./data/campus.json`) like the placeholder.
  - Dev page: `/dev/world.html?cam=x,y,z,yawDeg,pitchDeg&q=low|medium|high[&tiles=1|&gkey=KEY][&col=1][&spawns=1][&hud=0]`.
  - Offline generator `src/world/tools/gen.py` (pillow/numpy/scipy/shapely; not part of the build) regenerates
    `public/assets/world/{ground_macro.jpg,ground_mask.png,roofs.jpg,surface_classes.png,gen.json}` from `campus.json` + the satellite image.

### Round 2 additions (capture the flag, controls, buildings)
- **`src/visuals/flag.js`** (owner: World builder, Fable; placeholder exists):
  `createFlag({ team: 'red'|'blue' }) -> { object3D, setCarried(bool), update(dt), dispose() }`
  (origin at ground; when carried, gameplay parents `object3D` to the carrier's `character.object3D` and calls `setCarried(true)`)
  and `createFlagBase({ team }) -> { object3D, update(dt), dispose() }` (ground marker / base stand at a flag's home).
- **`world.ctfBases`** (owner: World builder): `{ red: THREE.Vector3, blue: THREE.Vector3 }` on open walkable ground.
  Default if missing (gameplay uses `world.ctfBases ?? DEFAULT`): red = Dickinson Field stadium midfield `(-150, 0, -99)`,
  blue = varsity baseball diamond outfield (SE of the main building) `(7, 0, 128)`.
- **`world.ctfSpawns`** (optional, World builder): `{ red: Vector3[], blue: Vector3[] }`, >= 8 each, near (25-70 m) their base,
  outdoors. Gameplay falls back to picking from `world.spawnPoints` by distance to own base.
- Teams' accent colors: red `0xe0242c`, blue `0x2a6bff` (pass as `color` to `createCharacter`).
- (World, round 2) Additions / changes:
  - `world.ctfBases = { red, blue }` (red = Dickinson Field midfield `(-153, 0, -101)`, blue = varsity baseball shallow centre field
    `(65, 0, 129)`, both snapped to open walkable ground) and `world.ctfSpawns = { red: Vector3[10], blue: Vector3[10] }`
    (ground level, 25-70 m from their own base, on the own-base side, biased toward cover).
  - `src/visuals/flag.js`: interface as specified. `createFlag().setCarried(true)` slings the pole across the carrier's back (expects to be
    parented to `character.object3D`, origin at feet, facing -z). Call `update(dt)` on flags and bases every frame (cloth wave, ring pulse).
  - Rooftops are play space: every school wing has a walkable roof deck in collision at `wing height - 0.4 m` (surface `'concrete'`), solid
    parapets (0.43 m above the deck), solid rooftop units / stair penthouses / skylights, and courtyards are open (cut out of the roof).
    Wing heights: 4-15.5 m (classroom wings 10 m, gym 11-12 m, field house 13.5 m, auditorium block 15.5 m). Press box, dugout roofs, buses,
    containers and bleachers were already solid on top; the water tower now has a domed collision top (34.3 m) and a railed catwalk at 30 m.
  - `spawnPoints` / `ctfSpawns` are ground-only (the flood fill never climbs onto roofs).
  - No `userData.noGrapple` is set anywhere: everything in `collisionMeshes` is fine to grapple. `userData.bulletPassthrough` (fences/nets)
    is unchanged; if grappling chain-link feels wrong, exclude those meshes with that same flag.
  - The surrounding neighbourhood is no longer built: only school-owned structures have geometry/collision; outside the school grounds the
    ground is lawn + the street network with a dense wooded border.
- (Gameplay, round 2) Uses `world.ctfBases`, `world.ctfSpawns` (fallback: open ground 25-60 m around each base, then nearest
  `spawnPoints`), `createFlag/createFlagBase` (flag parented to the carrier's `character.object3D` + `setCarried(true)`; hidden
  for the local carrier). `mesh.userData.bulletPassthrough` meshes are ignored by bullets and grapple targeting but are still
  solid for movement, and mantle treats them as climbable (fences/rails). Grapple rejects ground hits (up-facing within 0.8 m
  of `groundY`). Remote characters' grapple cable is a gameplay-owned mesh from an approximate left-hand point; Visuals may
  later expose a hand anchor (optional `Character.handWorldPosition(target)`) and Gameplay will use it if present.
  State message gained optional `ga: [x,y,z]` (grapple anchor). Team names shown to players: red = "Red Devils", blue = "Lions".
- (World, round 3) `ctfBases`: red = centre of the practice turf `(-59, 0, 37)`, blue = varsity baseball shallow centre field `(65, 0, 129)`
  (~155 m apart); `ctfSpawns` regenerated (10 each, 25-70 m from the own base, never on the enemy side). Sports facilities are rebuilt to
  rule-book dimensions (`src/world/fields.js`): 400 m track (lane 1) with eight 42 in lanes and 31.5 m bends (the real gap between the
  stands is ~80 m, so a 36.5 m / 1.22 m oval does not fit), NFHS football markings, 9 regulation tennis courts (only 9 fit the 51 x 111 m
  pad at regulation run-offs), 90 ft baseball diamond with a raised mound (collision bump 0.25 m, surface `'dirt'`), three 60 ft softball
  diamonds, soccer lines on the west practice field. The Grant St entrance now sits on a 1.0 m raised terrace (walkable, with a step
  ramp on the west side and an accessible ramp at the south end); the 55th St front has the main walk, planters, flagpoles and sign.

### Round 4 additions (melee motion, grenades, care packages, kill cam, classes)
Gameplay must call the new optional methods with `?.` so either side can land first.
- **Viewmodel** (`src/visuals/weapons.js`, Fable): `melee(durationSec)` big visible strike (rifle-butt/knife slash with
  body motion, ~0.45 s), `throwGrenade(durationSec)` (gun dips, off hand pulls pin and throws, ~0.6 s; the release moment is at
  ~55% of the duration), optional `setGrenadeInHand(bool)` for cooking.
- **Character** (`src/visuals/character.js`, Fable): `melee()`, `throwGrenade()` third-person animations.
- **Effects** (`src/visuals/effects.js`, Fable): `explosion(point, { radius = 6, surface })` fireball, flash light, smoke column,
  debris, dust ring, scorch decal (pooled); `smokeMarker(point, { color = 0xff4422, durationSec = 8 })` colored signal smoke
  for care-package drop zones.
- **`src/visuals/grenade.js`** (Fable, placeholder exists): `createGrenade() -> { object3D, update(dt), dispose() }`
  (world-space thrown frag; gameplay drives position/rotation).
- **`src/visuals/carePackage.js`** (Fable, placeholder exists): `createCarePackage({ team }) -> { object3D, setParachute(bool),
  open(), update(dt), dispose() }` (origin at crate bottom center; gameplay moves it while it descends).
- Camera shake / kill cam / HUD are gameplay's job (Opus).
- (World, round 4) No interface changes. Wall edges are now split wherever the neighbouring wing changes (31 places had walls
  missing below a neighbour's roof line or between wings 0.5 m apart in height); collision is unchanged in shape (same footprints/decks).
- (Visuals, round 4) Implemented as specified; details Gameplay may want:
  - `viewmodel.melee(dur=0.45)`: knife slash with the off hand (pistol: pistol-whip); contact at ~40 % of dur. `throwGrenade(dur=0.6)`: release at 55 %
    (the in-hand grenade disappears then; spawn the world grenade at that moment). `setGrenadeInHand(true)` presents and holds the grenade (pin out);
    a following `throwGrenade(dur)` throws from that pose with release still at 55 % of dur; `setGrenadeInHand(false)` puts it away. `equip()` cancels both.
  - `character.melee(dur=0.45)`, `character.throwGrenade(dur=0.7)` (left-arm overhand, grenade leaves the hand at 55 %).
  - `createGrenade({ armed = true })` (armed = pin pulled / lever gone, as in flight); `buildGrenadeModel()` is also exported.
  - `effects.explosion(point, { radius = 6, surface = 'dirt' })`: point should be on the ground (scorch decal is laid flat at point.y); at most 8 per 0.9 s,
    extra calls are dropped; adds two pooled PointLights to the scene at createEffects time. `effects.smokeMarker(point, { color, durationSec })`.
  - `createCarePackage({ team })`: team may be 'red' | 'blue' | 0 | 1 | a hex colour (default amber); `setParachute(false)` deflates the canopy over ~2.4 s;
    `open()` springs the lid and reveals the contents; call `update(dt)` every frame (beacon blink, canopy sway).
- (Visuals, round 4b) `effects.explosion` now renders through `src/visuals/blast.js` (pooled instanced billboards, 1024 cap, procedural fire->soot shader, shock ring, streak sparks, clods, ground-faded dust, drifting smoke column). Signature unchanged.
- (Gameplay, round 4) Calls (all optional, with `?.`): `viewmodel.melee(0.45)`, `viewmodel.throwGrenade(0.6)` (gameplay releases the
  grenade at 55% of that), `viewmodel.setGrenadeInHand(bool)` while cooking, `character.melee()` / `character.throwGrenade()` for
  remote players, `effects.explosion(point, { radius, surface })` (frags r=7, airstrike r=8), `effects.smokeMarker(point, { color,
  durationSec })` (care package 0xffaa22 / airstrike 0xff3322), `createGrenade()` per live thrown frag/marker (gameplay sets
  position + rotation each frame), `createCarePackage({ team })` with `setParachute(true)` while descending from 120 m and
  `open()` on capture. A landed crate becomes a solid 1.2 x 0.9 x 0.9 box for player movement (gameplay-owned collider).
  Entry is now `src/main.js` (mobile gate + intro) -> dynamic `import('./game/app.js')`, so phones never download the world.

### Round 6 additions (bots, team deathmatch, attack helicopter)
- **`src/visuals/helicopter.js`** (Fable visuals, placeholder exists): `createHelicopter() -> { object3D, gunMuzzle, rocketPods[2],
  seatEye, setRotorSpeed(0..1), setDamage(0..1), fireGun(), fireRocket(side), destroy(), reset(), update(dt), dispose() }`
  (origin at skid bottoms, nose toward -z) and `createRocket() -> { object3D, update(dt), dispose() }` (points along -z;
  gameplay moves it; the visual adds its own exhaust trail). Original design: a generic one-seat light attack helicopter, no real
  manufacturer markings. Explosions/tracers/impacts come from `effects.js`.
- **`world.navGrid`** (Fable world): `{ x0, z0, cell, nx, nz, walk: Uint8Array /* 1 walkable ground cell */, cost?: Float32Array }`
  ground-level walkable grid for bot pathfinding (gameplay runs A*), plus `world.navSample(x, z) -> bool` helper.
- **`world.heliSpawns`** (Fable world): `[{ pos: Vector3, yaw }]`, >= 12 candidate parking spots, ground or flat roof, with ~8 m
  rotor clearance all around and open sky above, chosen to be hidden/out of the way (courtyards, behind the field house, service
  yards, between buildings, roof corners). Gameplay picks one at random each FFA match (and after each destruction).
- (World, round 6) `world.navGrid = { x0, z0, cell: 1.25, nx: 408, nz: 338, walk, cost, walkableCells, unreachable }` (ground level only; a cell is
  walkable when nothing solid sits between 0.3 m and 2 m above it and no wall/fence/net separates it from its neighbours; flood-filled so all
  walkable cells are mutually connected; kerbs/low steps/the pitcher's mound are walkable, the raised Grant St terrace and roofs are not;
  `cost` is 1 next to cover rising to 2.5 in open fields, 0 on non-walkable cells) and `world.navSample(x, z) -> bool`. Spawns/CTF points that fall
  on a blocked cell are within a few cells of a walkable one (snap to the nearest walkable cell before pathing).
  `world.heliSpawns = [{ pos, yaw, roof }]` (19 validated spots: 13 on the ground, 6 on roof decks; >= 8 m clear of solids and tree trunks,
  open sky; yaw points the nose (-z) at an unobstructed direction). Dev page: `?show=heli`, `?show=nav`.
