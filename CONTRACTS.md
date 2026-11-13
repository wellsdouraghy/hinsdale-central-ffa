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
