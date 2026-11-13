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
