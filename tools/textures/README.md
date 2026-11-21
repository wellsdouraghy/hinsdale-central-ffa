# Textures from references (campus-agnostic)

Every campus gets building textures that are **generated** from numbers measured on reference photos of the real
buildings: unit sizes, course heights, bonds, joint widths and linear-RGB swatches. No reference pixel ships. This is a
required step of a campus build (MAP_NOTES.md "Textures from references"): facades are not done until the references,
the material sheet and the generated pack exist.

```
tools/textures/
  scrape.py      collect reference photos (polite: robots.txt, >= 1.2 s per host, generic User-Agent, no logins)
  refs.py        contact sheets, pruning, swatches (linear RGB), course pitch, committed text manifest
  generate.py    procedural tileable albedo + normal from the material sheet
  campuses/<id>/
    config.json     where to look (school site, Wikipedia / Commons, project and news pages)        hand-written
    notes.json      per photo: building, facade, what it shows                                      hand-written
    refs.json       manifest: url, source page, licence, building, notes (text only)                refs.py manifest
    materials.json  per-building material sheet + texture specs + overrides + wiring notes          hand-written
src/campuses/<id>/tools/data/refs/      the photos themselves (GITIGNORED, never committed, never shipped)
public/campuses/<id>/tex/               generated textures + tex.json (runtime manifest)            generate.py
src/world/campusTextures.js             loads the pack, creates keyed materials, applies overrides
```

Python: `numpy`, `pillow`, `scipy` (a venv is fine). Run everything from the repo root.

## Steps for a new campus

1. **Config.** Copy a `campuses/<id>/config.json`, fill in the school site, the Wikipedia title, Commons categories and
   every project / news page a web search finds (architect, contractor, engineer, local paper, district bond pages).
2. **Collect.** `python tools/textures/scrape.py <id>`. Image-search result pages and the Wikimedia / Openverse APIs are
   closed by robots.txt: the scraper records the skip and uses category / article / File pages instead. Add the Street
   View cache (`src/campuses/<id>/tools/streetview.py`) and Google 3D tiles obliques (`dev/<id>-tiles.html`, port 5173).
3. **Review.** `refs.py sheet <id> sheet.jpg 0 60` (local file, do not commit), drop people / interiors / adverts with
   `refs.py prune`, then write `notes.json` for every kept photo (building, facade, what it tells you).
   `refs.py manifest <id>` writes the committed `refs.json`.
4. **Measure.** `refs.py swatch ... --wb` on SUNLIT patches only (a shaded wall carries the sky's blue: Hinsdale's first
   pack came out grey that way), white-balanced and scaled against a known surface in
   the same frame (new concrete ~0.50, white paint ~0.80, cast stone ~0.60 linear). `refs.py pitch` + a known height
   (door leaf 2.13 m, CMU course 0.203 m) gives the course height. When a photo cannot resolve it, say so in the sheet
   and use the standard unit (modular brick 194 x 57 mm, 3 courses = 203 mm).
5. **Material sheet.** `materials.json`: `swatches`, `buildings` (wall, unit / course, mortar, trim, windows, roof,
   signage, which texture, which refs), `textures` (generator specs) and `overrides`.
6. **Generate.** `python tools/textures/generate.py <id> --preview /tmp/prev`. Look at the 3 x 2 tiled previews for
   seams and repetition. Kinds: brick (running, third, stack, flemish, common, english; dark headers), block, pavers,
   panels, stucco, concrete (broom, form boards, control joints), siding, shingle_siding, board_batten, metal_seam,
   clay_tile, asphalt_shingle, court, planks.
7. **Wire** (below), then the checks: map check 0 fails, practice without console errors, FPS on medium, download size,
   and a side-by-side per school building (game vs photo vs tiles) in `dev/shots/textures/<id>/`
   (`ref-compare/` inside it is gitignored: it contains the reference photos).

## Wiring a campus

- Descriptor: `files.textures: 'campuses/<id>/tex/tex.json'`. Before that line exists the pack can be previewed with
  `?tex=1`; `?tex=0` turns a pack off (that is the "before" for screenshots).
- `overrides` in the sheet re-skin materials the builder already uses (`brick`, `stucco`, `limestone`, `shingles`,
  `<id>Paver` ...) with no code change. Tinted (vertex-colour) materials want a NEUTRAL tile with the old mean
  (MEASURE the tile it replaces: stucco canvas 0.85, shared shingles 0.032, not the 0.2 a code comment claims) so the builder's per-building tints keep working; the tints are then set from the
  swatches (`swatch / tile mean`).
- `replaces` (sheet top level): shared tiles the pack makes redundant on this campus (`brickColor`, `brickNormal`,
  `brickRough` when both `brick` and `brickRed` are overridden). They are then not downloaded at all.
- A texture with `key` becomes its own material: write walls to `ctx.B.v(key, true)` or, through the facade kit, give
  the style `wall: '<key>'` (src/world/facade.js). Without a pack the kit falls back to `'brick'` + `tint`.
- `uvM` = metres per UV unit of the geometry (facade kit 2.2, limestone 3.0, roofs 3.0). The loader sets
  `repeat = uvM / sizeM`, so a course is exactly `courseM` tall everywhere. Facade-kit walls on a generated masonry
  texture snap sills and heads to its courses and make soldier lintels one brick tall.
- Style options for a campus kit (src/world/facade.js): `frame`, `band`, `coping` = material keys for sashes / doors, the
  panel band and the coping; `upper: '<key>'` on a 'modern' style = a closed upper storey in that keyed texture over a
  glazed base; `noCorner` drops the corner piers. `rot: 90` on a texture spec lays a vertical-seam tile horizontally
  (ribbed metal, louvre blades: `metal_seam` with `rib_color`, `sharp`, `posts`). Pack-only tints and styles are set
  under `if (ctx.TX)` so `?tex=0` is still the look before the pack (Marin: `PACK` in src/campuses/marin/kit.js).
- Corners: the facade kit carries `uOff` round the ring, so bond and courses continue across returns. Never scale a
  texture to fit a wall; change the wall (or the snap) instead.
- No visible repetition: tiles are 2-5 m with low frequencies flattened, and every material with `weather: [grime,
  damp base, efflorescence]` (all keyed textures by default; an override only when the sheet asks, because it replaces
  the material's own fragment hook: fine for `brick` and plain standard materials) runs the shared surface shader in
  src/world/campusTextures.js: a second sample of the tile shifted by `altM` (a whole number of units / courses, from
  the generator) cross-faded by world noise, tone and warm-cool drift (`macro`, 0.3), rain streaks (`streaks`, 0.1),
  micro grain near the camera (`micro`, 0.1) and texel-driven roughness (`roughVar`, 0.5). `alt: 0` switches the
  second sample off for one texture; low quality never takes it. All of its noise is sampled in the surface's own
  plane (distance along the wall, height): never `xz * f + y * g`, which shears blobs into diagonal slashes. The
  second sample is fetched only inside the cross-fade band (`textureGrad`), efflorescence only between 0.25 and 3 m.
- Colour is judged in the game: the tone curve and the sky fill lift G and B on a sunlit wall, so a face target that
  matches the photo swatch can render peach. Measure a wall patch in a screenshot (sunlit R/G >= 1.3 for red-brown
  brick, B < G in shade) and move the target (MAP_NOTES "Textures from references", item 9).
- Before overriding a shared material key, grep where it is used: one key must not skin both paving and walls
  (Hinsdale `brickRed`: walks now use the keyed `hcPaver`, low walls the `hcBrickRed` tile).
- Brick piers: `fbox(..., 'f')` for the face and `fbox(..., 'sw')` for the returns (shaded, bond wrapped round the
  corner, lit like the wall: thin returns otherwise catch sun that leaks through the shadow bias).
- Masonry colour: `colors` + `weights` are the palette of unit faces, `target` the measured mean of the FACES (mortar is
  its own swatch), `target_tile` a whole-wall mean instead. Detail knobs (all optional): `texture` (wirecut, sand,
  smooth, split), `unit_var`, `hue_var`, `grad`, `flash`, `heart_frac`, `scum_frac`, `chips`, `wobble`, `smear`, `pits`,
  `bake_shadow`. Concrete: `boards` (board-formed, plank height in m), `pinholes`.
- Budget: 1024 px per ~2.5 m (2048 x 1024 only for variegated brick), albedo + normal JPG, no roughness map (scalar).
  Normal maps are skipped on low quality. A pack is 2-4 MB per campus and only that campus downloads it.

## Copyright

Scraped photos are references only. They stay in the gitignored cache; the manifest records url, page and licence.
Example-based synthesis from a photo is allowed only from a licence that permits it (CC0 / CC BY / CC BY-SA), with the
attribution in `refs.json` and CREDITS.md. The current packs use none: every texture is procedural.
