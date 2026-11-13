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
