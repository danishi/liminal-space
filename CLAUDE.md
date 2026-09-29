# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Language

- Code, comments, README, commit messages and pull request titles/descriptions: **English**.
- All in-game UI text and dialogue: **English**. Japanese appears only as flavour inside the Japan-themed
  levels (level subtitles, in-world signage such as station signs, ema plaques, chalkboards), usually
  paired with English the way real bilingual signs are.
- The maintainer is Japanese; replies in chat should be in Japanese.

## Project

Liminal Drift is a three.js walking game (Vite, plain ES modules, no framework, no TypeScript). There
are no quests: levels are chosen at random and you drift between them via humming doors, holes, or when
the level's signal (a timer) runs out. See README.md for the player-facing description.

Commands:

```bash
npm install
npm run dev     # local dev server
npm run build   # production build to dist/ — run this before committing
```

CI only builds and deploys `main` to GitHub Pages; there is no PR check. There is no test suite. Verify changes by building and, for gameplay changes, by running the game.
For headless checks use Playwright with Chromium (`--use-angle=swiftshader`); software rendering runs at
about 1 fps, so drive gameplay by calling `window.__game.frame(dt)` (or `updatePlay(dt)`) in a loop
rather than waiting in real time. Level builds are reproducible for a given seed if `Math.random` is
seeded right before `buildWorld` (three.js draws uuids from it, and a few canvas painters use it).

## Architecture

- `src/core/grid.js` — the 2.5D tile map every level is built on. Cells have a type (`FLOOR`, `WALL`,
  `WATER`, `DOORWAY`, `VOID`, `HOLE`) and a floor height; ramp cells are stairs. `passable()` decides
  whether you can walk between neighbours (max step 0.55 m). Geometry builders (`buildWallFaces`,
  `buildFloors`, `buildRisers`, `buildStairs`, `buildCellQuads`) turn the grid into merged meshes.
- `src/game/world.js` — a built level: collision (grid + prop boxes + circles, height-aware), the
  `unease(i, j)` gradient, doors to other levels, entities. Stage modules fill it in.
- `src/game/game.js` — renderer, post-processing, reflection probe capture, the drift flow, HUD updates.
  `start(index, depth)` begins a run: Start drifting picks a random level at depth 0, the title's level
  list passes the chosen level and starting depth (the pause screen's "levels passed" counts from
  `startDepth`).
  `frame(dt)` runs one frame of simulation and rendering; the drift loads the next level (module, assets,
  looks), builds it, then compiles its shaders (`warmShaders`) while the screen is black, and nothing is
  drawn while `loading`. After a level starts, `prefetchAhead` picks where a fading signal will drop you
  and downloads that level and the ones behind the doors.
- `src/game/player.js` — movement, keyboard turning, steering assist, gravity and falling.
- `src/stages/index.js` — the level registry: `STAGES` holds each level's `{ id, code, name, sub, tint,
  load }` and is the only stage code in the main bundle. `loadStage(i)` imports the level's module and
  merges its definition into the entry, so always go through it before touching `assets`, `build` etc.
- `src/stages/*.js`, `src/stages/<level>/index.js` — one module per level (mall, garage and bathhouse are
  folders: `constants`, `textures`, `props`, `entities`, then one file per build phase). The module's
  default export is `{ assets, build(world), makeDoor(world, destStage), bleed?, … }` (destStage may not
  be loaded: only use its registry fields such as `tint`). In `build`, carve the grid, set `world.spawn`,
  call `world.finalizeLayout()` (seals unreachable pockets and computes distances), then build geometry,
  lights, props (`decorate` with a prop table), residents and apparitions, and fill `world.env`. In a
  folder level, `build` calls the phases in order and they share state through a plain `lvl` object
  (`const { … } = lvl` at the top, `Object.assign(lvl, { … })` at the end); keep the order, since the
  sequence of `rng` calls decides the layout.
- `src/stages/common.js` — `buildShell`, `ceilingFixtures`, `doorModel`, `decorate`, `stairRun`, `carveMaze`.
  Shared low-level helpers live in core: `canvasTexture` (textures.js; kept in a session cache by
  key, or owned by the level when the key is null), `GeoBuilder`/`quadPts` and `SIDES` (grid.js), `hash2`/`rngFn` (rng.js),
  `AudioEngine.hum`.
- `src/props/` — `PropKit` builds props from primitives and merges static meshes per material in
  `finish()`; mark animated or individually-changing meshes with `keep()`. `library.js` holds the prop
  builders; each has `place` (`wall`, `high`, `floor`, `clutter`, `ceil`) and an optional footprint `fp`.
- `src/core/assets.js` — photo-scanned CC0 assets from Poly Haven in `public/assets` (1k texture sets as
  WebP, meshopt-compressed GLB models, HDRIs), listed in `manifest.json`. A stage declares what it needs
  in `assets: { textures, models, hdris }`; the game awaits `preload()` before `build`, so builders use
  the synchronous getters (`photo(id, { uvScale })`, `model(id)`, `hdri(id)`). `photo` repeats the
  texture to its real-world size given the geometry's UV scale. `PropKit.model()` and
  `P.modelProp(id)` place models; model geometry and materials are shared (`userData.shared`): the
  asset cache owns them. `World.dispose` frees everything the level made (geometry, materials,
  instance buffers, skeletons, shadow maps) and the GPU copy of every texture its materials use, cached
  ones included (a cache keeps only the pixels, and three.js uploads a disposed texture again when it is
  used). `BufferGeometry.clone()` copies `userData` by reference, so reset it (`geo.userData = {}`)
  when cloning a shared geometry you own.
- `src/core/cache.js` — memory between levels. Loaded assets, keyed `canvasTexture`s and surfaces live
  in `SessionCache`s; before a level loads, `Game.loadLevels` keeps what the level lists in `assets`
  and trims the rest, least recently used first, to `CACHE_BUDGET` (game.js), or to nothing on phones
  and tablets (`mobileDevice()` in settings.js): iOS kills a tab that goes over its memory limit ("A
  problem repeatedly occurred"). The old level is disposed before the next one loads (and the map and
  the renderer's lists let go of it), so two levels are never in memory together. Module-level caches
  of things made from cached assets must follow them (key by `loadedModel(id)`, or check the texture
  is still the cached one) rather than keep an evicted copy alive. On phones, tablets and at low
  quality the texture detail is 0.5: asset textures (except colour maps with alpha), HDRIs and surfaces
  are scaled down as they load, and `canvasTexture(…, { shrink: true })` does the same for big
  canvases that are painted in absolute pixels.
- `src/core/surfaces.js` — procedural PBR surfaces (colour + normal + roughness), cached by key.
- `src/core/sculpt.js` — SDF sculpting: a `Sculpt` collects primitives (`sphere`, `ellipsoid`, `cone`
  (round cone), `box`, `cyl`, `torus`, with `k` blend, `bone`, `mat` paint region, `cut`, `rot`, `clip`,
  `noise`), `sculptGeometry` polygonises it (narrow-band surface nets, cached by key) with vertex colours,
  `rough`/`emit` attributes and optional skin weights, `skinnedSculpt` builds a SkinnedMesh from named
  joints, `sculptMaterial` adds triplanar detail normals and a light-probe uniform.
- `src/entities/figures.js` — humanoid (`human`) and quadruped (`beast`) rigs on top of sculpt.js: a
  skinned body plus finer head and hands on their bones; `Rig`, `POSES`, `applyPose`, `walkPose`,
  `idlePose`, `lookAt`, `beastPose`, `setFigureOpacity` (alpha-hashed fades), `updateProbe`.
  `src/entities/looks.js` is the cast (`LOOKS.watcher()`, `.mannequin()`, `.attendant()`, …, `carModel`,
  `grinFace`, `robotVacuum`) and `prewarm()`; stages list the looks they use in `assets.looks` so they are
  built during loading. Sculpted meshes set `userData.noBake` and get light from `world.probe()` instead.
- `src/game/bleed.js` — crossed signals: `pickBleed` chooses earlier levels to leak in, `applyBleed`
  overlays a donor's surfaces (glitch-discard shader), props and a stray resident in a zone before
  baking. Stages opt in with a `bleed` block: `{ ambience, looks, surfaces() → { wall, floor, ceil } (each a
  material or { mat, uv }), props (decorate spec), stray(world, pos) → entity }`.
- `src/game/collapse.js` — levels coming apart, cell by cell: the signal's last half minute crumbles the
  level from its far edges toward the player (the floor under them goes last, which ends the level as a
  fall), cracked floor patches give way when stepped on, and quakes drop a stretch nearby. A cell warns
  (cracks, shiver, flickering fixtures), then becomes `HOLE` in the grid. `patchCollapse` adds a lookup
  into a per-cell data texture (R crack, G shiver, B solid, A gone) to every level material (and the GTAO
  normal pre-pass) and discards what's gone; its uniforms are module-level, like the bake's, so shared
  materials follow the current level. Small entities (residents, apparitions, doors) aren't patched and
  fall whole instead. `debris.js` holds the falling chunks (instanced copies of the cell's floor, wall
  and ceiling materials) and dust. Stages opt out with `world.env.collapse = false`.
- `src/core/bake.js` — per-vertex baked lighting and AO (`bake` attribute, applied through a material
  shader patch). `World.bake()` runs after `stage.build`; light pool fixtures are sources automatically,
  extra sources go in `world.bakeSources`, and `world.env.bake` tunes it (`hemi`, `dynamic`, `bounce`,
  `fixtureScale`, `tess`) or disables it (`false`). Geometry from the grid builders is tagged
  `userData.quads` so it can be tessellated before baking.

## Conventions

- Binary assets are CC0 only (Poly Haven) and are fetched and optimized by `node scripts/fetch-assets.mjs`
  (downloads, converts textures to WebP, compresses models, writes the manifest). Add new ones to the
  lists in that script rather than committing hand-made files. Signs, posters and small details stay
  canvas-generated; sounds are Web Audio.
- Keep the number of lights constant within a level (the flashlight always exists, light pools have a
  fixed size) to avoid shader recompiles mid-level.
- Apparitions are never lethal. The game has no fail state.
- Characters and organic props are sculpted in code (sculpt.js / figures.js), not imported; keep new
  looks in looks.js and add them to the stage's `assets.looks`.
- New content should respond to unease: use the `min`/`max` thresholds in prop tables and scale
  densities or effects with `world.depth` / `world.unease()`.
- Match the surrounding code style: 2-space indentation, single quotes, semicolons, short comments
  that explain intent.
