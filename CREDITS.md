# Credits

## Gameplay
- All gameplay sound effects (gunshots, reloads, footsteps, hit/kill feedback) are synthesized at runtime with the Web Audio API (`src/game/audio.js`); no audio samples are used.
- UI icons (weapon silhouettes, crosshair favicon) are original inline SVG drawn for this project.
- Networking: [PeerJS](https://peerjs.com/) (MIT) using the free public PeerJS cloud broker (0.peerjs.com) for signaling.
- Minimap imagery: Esri World Imagery (Esri, Maxar, Earthstar Geographics, and the GIS User Community), same file as the World module.

## Visuals
- **Soldier character** (`public/assets/visuals/soldier.glb`): "Soldier.glb" from the three.js examples
  (https://github.com/mrdoob/three.js/blob/r187/examples/models/gltf/Soldier.glb, repository MIT-licensed). The model is the
  Adobe Mixamo character "Vanguard" (by T. Choonyung) with Mixamo idle/walk/run animations; Mixamo characters and animations
  are royalty-free for personal and commercial projects, including games (https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html).
- **First-person hand meshes** (`public/assets/visuals/hand_left.glb`, `hand_right.glb`): "generic-hand" profile from
  `@webxr-input-profiles/assets` v1.0.19 (https://github.com/immersive-web/webxr-input-profiles, MIT License). Re-posed and re-textured as gloves at runtime.
- **Weapons** (carbine, submachine gun, bolt-action rifle, pump shotgun, pistol), optics, gloves/sleeves, muzzle flashes, tracers,
  impact particles, bullet-hole decals, camouflage, wood, wear and normal textures: original, generated procedurally in code
  (`src/visuals/guns.js`, `textures.js`, `hands.js`, `effects.js`). No third-party textures or weapon models are used.
- three.js (MIT) addons: GLTFLoader, SkeletonUtils, BufferGeometryUtils, RoundedBoxGeometry.

## World
- **Map data**: (c) OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright), via `public/data/campus.json`.
- **Aerial imagery** (ground macro colour, roof textures, surface mask derived from it): Esri World Imagery (Esri, Maxar, Earthstar
  Geographics, and the GIS User Community), `public/assets/satellite/campus_z19.jpg`.
- **Google Photorealistic 3D Tiles** (optional mode, streamed at runtime with the user's own key; nothing is stored in the repo):
  (c) Google and its data providers; attribution and the Google logo are shown on screen while the mode is active
  (https://developers.google.com/maps/documentation/tile/3d-tiles). Wing heights of the built-in school model were measured against it.
- **Sky HDRI** `public/assets/world/sky_2k.hdr`: "Kloofendal 48d Partly Cloudy (Pure Sky)" by Greg Zaal, Poly Haven, CC0
  (https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky).
- **Brick** `tex/brick_*.jpg`: "Brick Wall 09" by Rob Tuytel / Matterfield, Poly Haven, CC0 (https://polyhaven.com/a/brick_wall_09);
  the colour map was re-toned toward the school's buff brick (2K maps, AO baked into the colour).
- **ambientCG textures** (all CC0, https://ambientcg.com/, by Lennart Demes): `tex/grass_*` = Grass001 (https://ambientcg.com/view?id=Grass001),
  `tex/asphalt_*` = Asphalt012 (https://ambientcg.com/view?id=Asphalt012), `tex/concrete_*` = Concrete034 (https://ambientcg.com/view?id=Concrete034),
  `tex/bark_*` = Bark012 (https://ambientcg.com/view?id=Bark012), `tex/shingles_*` = RoofingTiles013A (https://ambientcg.com/view?id=RoofingTiles013A),
  `tex/leaf_broad.png` = LeafSet024 (https://ambientcg.com/view?id=LeafSet024), `tex/leaf_conifer.png` = LeafSet019 (https://ambientcg.com/view?id=LeafSet019).
- **Draco decoder** `public/assets/world/draco/*`: Google Draco (Apache-2.0), copied from `three/examples/jsm/libs/draco/gltf/` (used only for Google tiles).
- **Libraries**: three.js (MIT), three-mesh-bvh (MIT), 3d-tiles-renderer (Apache-2.0), postprocessing (Zlib), n8ao (ISC).
- **Reference photos** (not redistributed; used only to match materials/massing): Wikimedia Commons "Hinsdale Central High School in
  Illinois 01/02/05/06" (CC0) and "Aerial view of Hinsdale Central High School, October 2024" (CC BY-SA 4.0).
- Trees, cars, buses, bleachers, the water tower, field markings, signage and all other geometry/textures not listed above are procedural (original).
